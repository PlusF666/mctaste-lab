"""McTaste Lab's small, read-only Streamable HTTP MCP client. Python 3.10+."""
import argparse
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import json
import os
import re
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ENDPOINT = 'https://mcp.mcd.cn'
ALLOWED = {'query-meals', 'query-nearby-stores', 'query-meal-detail', 'now-time-info'}


class MCPError(RuntimeError):
    pass


class Client:
    def __init__(self, token):
        if not token or '\n' in token or '\r' in token:
            raise MCPError('请在本机环境变量 MCD_MCP_TOKEN 中设置有效 Token')
        self.token, self.session, self.counter = token, None, 0
        self.protocol = '2025-03-26'

    def rpc(self, method, params=None, notify=False):
        self.counter += 1
        body = {'jsonrpc': '2.0', 'method': method}
        if not notify:
            body['id'] = self.counter
        if params is not None:
            body['params'] = params
        headers = {'Authorization': 'Bearer ' + self.token,
                   'Content-Type': 'application/json',
                   'Accept': 'application/json, text/event-stream'}
        if self.session:
            headers['Mcp-Session-Id'] = self.session
        if method != 'initialize':
            headers['MCP-Protocol-Version'] = self.protocol
        request = Request(ENDPOINT, json.dumps(body).encode(), headers)
        try:
            with urlopen(request, timeout=35) as response:
                session = response.headers.get('Mcp-Session-Id')
                if session:
                    self.session = session
                if notify:
                    return {}
                if 'text/event-stream' in response.headers.get('Content-Type', ''):
                    data, result = [], None
                    for raw in response:
                        line = raw.decode('utf-8').rstrip('\r\n')
                        if line.startswith('data:'):
                            data.append(line[5:].lstrip())
                        elif not line and data:
                            event = json.loads('\n'.join(data))
                            data = []
                            if event.get('id') == body['id']:
                                result = event
                                break
                    if result is None:
                        raise MCPError('SSE 响应结束，但未收到对应请求的结果')
                else:
                    result = json.load(response)
        except HTTPError as exc:
            reason = {401:'Token 无效或已过期',403:'权限不足',429:'限流，请稍后手动重试'}.get(exc.code,'服务请求失败')
            # Only expose the error message, never headers or the raw response.
            detail = ''
            if exc.code == 400:
                raw = exc.read(8192).decode('utf-8', errors='replace')
                try:
                    error = json.loads(raw)
                    error = error.get('error', error)
                    detail = error.get('message', '') if isinstance(error, dict) else error
                except (ValueError, AttributeError):
                    detail = raw if '<' not in raw else ''
                if isinstance(detail, str):
                    detail = detail.replace(self.token, '[REDACTED]')
                    detail = re.sub(r'(?i)bearer\s+\S+', 'Bearer [REDACTED]', detail)
                    detail = ' '.join(detail.split())[:240]
                else:
                    detail = ''
            raise MCPError(f'HTTP {exc.code} [{method}]：{reason}' + (f'；{detail}' if detail else '')) from None
        except (URLError, TimeoutError, OSError):
            raise MCPError('网络连接失败或超时；未写入快照，请稍后重试') from None
        if result.get('id') != body['id']:
            raise MCPError('MCP 响应 ID 与请求不一致')
        if 'error' in result:
            raise MCPError('MCP 返回协议错误，请核对工具名、参数和当前 schema')
        return result.get('result', {})

    def initialize(self):
        result = self.rpc('initialize', {'protocolVersion':self.protocol, 'capabilities':{},
                                        'clientInfo':{'name':'mctaste-lab','version':'1.0.0'}})
        self.protocol = result.get('protocolVersion', self.protocol)
        self.rpc('notifications/initialized', notify=True)

    def tools(self):
        tools, cursor, seen = [], None, set()
        for _ in range(20):
            result = self.rpc('tools/list', {'cursor':cursor} if cursor else {})
            tools.extend(t for t in result.get('tools', []) if t.get('name') in ALLOWED)
            cursor = result.get('nextCursor')
            if not cursor:
                return tools
            if cursor in seen:
                raise MCPError('工具列表游标循环，停止请求')
            seen.add(cursor)
        raise MCPError('工具列表超过 20 页，停止请求')

    def call(self, name, arguments):
        if name not in ALLOWED:
            raise MCPError('此客户端仅开放门店、菜单和时间只读菜单工具')
        result = self.rpc('tools/call', {'name':name,'arguments':arguments})
        if result.get('isError'):
            raise MCPError('工具执行失败；未生成快照，请核对当前 schema 和业务参数')
        return result


def payload(result):
    if isinstance(result.get('structuredContent'), (dict, list)):
        return result['structuredContent']
    parts = [c['text'] for c in result.get('content', []) if c.get('type') == 'text']
    if len(parts) != 1:
        raise MCPError('响应不是单个结构化对象，请在本地检查响应后适配解析器')
    try:
        return json.loads(parts[0])
    except json.JSONDecodeError:
        raise MCPError('响应正文不是 JSON；不猜测餐品字段') from None


def pointer(value, path):
    """RFC 6901 JSON Pointer, e.g. /data/items. Empty string selects root."""
    if not isinstance(path, str) or (path and not path.startswith('/')):
        raise ValueError('字段路径须为 JSON Pointer，如 /data/items')
    for token in path.split('/')[1:]:
        token = token.replace('~1', '/').replace('~0', '~')
        value = value[int(token)] if isinstance(value, list) else value[token]
    return value


"""Discover real MCP schemas and collect explicitly annotated, read-only menus."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
from mcp_client import Client, MCPError, payload, pointer, ALLOWED

FEATURES = {'beef','chicken','fish','snack','dessert','drink'}


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def save(path, value):
    p=Path(path)
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')


def normalize(data, mapping, annotations, context, captured_at):
    """Field paths are confirmed from real response, never invented API fields."""
    rows=pointer(data,mapping['items'])
    if not isinstance(rows,list): raise ValueError('items 必须指向餐品数组')
    if not isinstance(annotations,dict): raise ValueError('annotations 必须为按餐品 ID 组织的对象')
    for field in ('store_id','store_name','dining_mode'):
        if not isinstance(context.get(field),str) or not context[field].strip(): raise ValueError('缺少范围字段 '+field)
    result,seen=[],set()
    for row in rows:
        raw_id=pointer(row,mapping['id'])
        if raw_id is None or isinstance(raw_id,(dict,list,bool)): raise ValueError('餐品 ID 类型无效')
        identifier=str(raw_id)
        if identifier not in annotations: continue
        if identifier in seen: raise ValueError('已选餐品 ID 重复；请先处理规格与分页')
        seen.add(identifier)
        annotation=annotations[identifier]
        if annotation.get('feature') not in FEATURES: raise ValueError('餐品注释需要有效的 feature')
        name=pointer(row,mapping['name'])
        if not isinstance(name,str) or not name.strip(): raise ValueError('餐品名称缺失')
        # Images and descriptions are optional and should be tied to this exact SKU.
        item={'id':identifier,'name':name,'feature':annotation['feature'],'category':annotation.get('category','门店餐品'),'price_fen':None}
        if annotation.get('image'): item['image']=annotation['image']
        if annotation.get('caption'): item['caption']=annotation['caption']
        result.append(item)
    if len(result)<2: raise ValueError('实际菜单中匹配到的已注释餐品不足 2 项；不生成虚构候选')
    if len(result)>500: raise ValueError('体验候选最多 500 项')
    absent=set(annotations)-seen
    return {'version':1,'source':'mcp','captured_at':captured_at,
            'context':{k:context[k] for k in ('store_id','store_name','dining_mode')},
            'note':'仅包含本次真实响应中已核对分类的餐品，不代表完整门店菜单；价格不用于本实验。',
            'provenance':{'server':'https://mcp.mcd.cn','tool':'query-meals','collector':'mctaste-lab/1.0.0','observed_count':len(rows),'annotated_count':len(result),'absent_annotation_count':len(absent)},
            'items':result}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest='mode',required=True)
    d=sub.add_parser('discover');d.add_argument('--out',required=True)
    raw=sub.add_parser('raw');raw.add_argument('--tool',choices=sorted(ALLOWED),default='query-meals');raw.add_argument('--arguments',required=True);raw.add_argument('--out',required=True)
    collect=sub.add_parser('collect')
    for k in ('arguments','mapping','annotations','context','out'): collect.add_argument('--'+k,required=True)
    args=p.parse_args()
    client=Client(os.environ.get('MCD_MCP_TOKEN'));client.initialize()
    if args.mode=='discover': save(args.out,{'server':'https://mcp.mcd.cn','tools':client.tools()})
    else:
        arguments=read_json(args.arguments)
        if not isinstance(arguments,dict): raise ValueError('arguments 必须为 JSON 对象')
        response=client.call(args.tool if args.mode=='raw' else 'query-meals',arguments)
        if args.mode=='raw': save(args.out,response)
        else:
            catalog=normalize(payload(response),read_json(args.mapping),read_json(args.annotations),read_json(args.context),datetime.now(timezone.utc).isoformat())
            save(args.out,catalog)
    print('本地采集完成；原始响应可能含门店地点，请勿直接公开。')


if __name__=='__main__':
    try: main()
    except (MCPError,ValueError,KeyError,TypeError,IndexError,OSError) as e:
        print('采集失败：'+(str(e) if isinstance(e,(MCPError,ValueError)) else '请核对本地参数、字段映射与注释'),file=sys.stderr)
        sys.exit(1)

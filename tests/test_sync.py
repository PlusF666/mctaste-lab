from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import io
from urllib.error import HTTPError
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from sync_catalog import normalize
from mcp_client import Client,MCPError,payload,pointer


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.data={'items':[{'id':'a','name':'实际返回 A','private':'do-not-publish'},{'id':'b','name':'实际返回 B'},{'id':'c','name':'不注释则不选择'}]}
        self.mapping={'items':'/items','id':'/id','name':'/name'}
        self.annotations={'a':{'feature':'beef'},'b':{'feature':'fish'}}
        self.context={'store_id':'test-only','store_name':'测试范围','dining_mode':'外带','phone':'do-not-publish'}

    def result(self): return normalize(self.data,self.mapping,self.annotations,self.context,'2026-10-22T00:00:00Z')

    def test_only_real_response_items_selected(self):
        c=self.result();self.assertEqual([x['id'] for x in c['items']],['a','b']);self.assertEqual(c['items'][0]['name'],'实际返回 A')

    def test_official_product_map_preserves_actual_codes(self):
        self.data={'data':{'meals':{'a':{'name':'实际返回 A'},'b':{'name':'实际返回 B'}}}}
        self.mapping={'items':'/data/meals','id':'/key','name':'/value/name'}
        c=self.result()
        self.assertEqual([x['id'] for x in c['items']],['a','b'])
        self.assertEqual(c['provenance']['observed_count'],2)

    def test_unobserved_annotations_do_not_fabricate_food(self):
        self.annotations['fake']={'feature':'snack'};c=self.result();self.assertEqual(len(c['items']),2);self.assertEqual(c['provenance']['absent_annotation_count'],1)

    def test_missing_categories_reject_instead_of_guessing(self):
        self.annotations['a']['feature']='unknown'
        with self.assertRaises(ValueError): self.result()

    def test_insufficient_matches_rejected(self):
        del self.annotations['b']
        with self.assertRaises(ValueError): self.result()

    def test_private_fields_and_unverified_prices_omitted(self):
        c=self.result();self.assertNotIn('phone',c['context']);self.assertNotIn('private',c['items'][0]);self.assertIsNone(c['items'][0]['price_fen'])

    def test_duplicate_sku_rejected(self):
        self.data['items'].append(self.data['items'][0])
        with self.assertRaises(ValueError): self.result()

    def test_scope_required(self):
        del self.context['dining_mode']
        with self.assertRaises(ValueError): self.result()

    def test_mutating_tools_blocked_before_network(self):
        client=Client('test-only-placeholder')
        with patch.object(client,'rpc') as rpc:
            with self.assertRaises(MCPError): client.call('create-order',{})
            rpc.assert_not_called()

    def test_missing_token_fails_without_network(self):
        with self.assertRaises(MCPError): Client(None)

    def test_json_pointer_and_both_content_shapes(self):
        self.assertEqual(pointer({'a/b':{'~':1}},'/a~1b/~0'),1)
        self.assertEqual(payload({'structuredContent':{'items':[]}}),{'items':[]})
        self.assertEqual(payload({'content':[{'type':'text','text':'{"items":[]}'}]}),{'items':[]})

    def test_json_protocol_session(self):
        r=io.BytesIO(b'{"id":1,"result":{"tools":[]}}');r.headers={'Content-Type':'application/json','Mcp-Session-Id':'mock'}
        with patch('mcp_client.urlopen',return_value=r) as fetch:
            client=Client('test-only-placeholder');self.assertEqual(client.rpc('tools/list',{}),{'tools':[]});self.assertEqual(client.session,'mock');self.assertEqual(fetch.call_args.args[0].get_method(),'POST')

    def test_sse_waits_for_matching_result(self):
        r=io.BytesIO(b'data: {"method":"notifications/progress"}\n\ndata: {"id":1,"result":{"ok":true}}\n\n');r.headers={'Content-Type':'text/event-stream'}
        with patch('mcp_client.urlopen',return_value=r): self.assertEqual(Client('test-only-placeholder').rpc('tools/list',{}),{'ok':True})

    def test_http_400_identifies_stage_without_exposing_token(self):
        response = io.BytesIO(b'{"error":{"message":"Unsupported protocol: test-only-placeholder"}}')
        error = HTTPError('https://mcp.mcd.cn',400,'Bad Request',{},response)
        with patch('mcp_client.urlopen',side_effect=error):
            with self.assertRaises(MCPError) as caught:
                Client('test-only-placeholder').rpc('initialize',{})
        self.assertIn('[initialize]',str(caught.exception))
        self.assertIn('Unsupported protocol',str(caught.exception))
        self.assertNotIn('test-only-placeholder',str(caught.exception))


if __name__=='__main__': unittest.main()

import {readFileSync} from 'node:fs';
import {nextPair,summarize} from '../dist/engine.mjs';
const catalog=JSON.parse(readFileSync(new URL('../dist/catalog.json',import.meta.url)));
const history=[];
for(const choice of ['left','right','left','both','left','right']){
  const pair=nextPair(catalog,history);if(!pair)break;
  history.push({left:pair[0].id,right:pair[1].id,choice});
}
const r=summarize(catalog,history);
console.log(JSON.stringify({source:catalog.source,title:r.title,weights:r.weights,favorites:r.favorites.map(x=>x.name),discovery:r.discovery.map(x=>x.name)},null,2));

import {readFileSync} from 'node:fs';
import {restoreSession,nextPair,summarize} from '../dist/engine.mjs';
try {
  if(process.argv.length!==3)throw new Error('用法：node scripts/experiment.mjs session.json');
  const d=restoreSession(JSON.parse(readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,'')));
  const r=summarize(d.catalog,d.history,d.overrides||{},d.excluded||[]);
  const pair=d.history.length<6?nextPair(d.catalog,d.history,d.excluded||[]):null;
  console.log(JSON.stringify({source:d.catalog.source,rounds:d.history.length,next_pair:pair?.map(x=>({id:x.id,name:x.name,feature:x.feature}))||null,weights:r.weights,evidence:r.model.evidence,title:r.title,favorites:r.favorites.map(x=>({id:x.id,name:x.name})),discovery:r.discovery.map(x=>({id:x.id,name:x.name}))},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}

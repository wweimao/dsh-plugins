const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const root='/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/';
const native=!!process.versions.electron;
const fixture={activePresetId:'demo',presets:[{id:'demo',name:'Mixed providers',main:{provider:'openai-codex',model:'gpt-test'},executor:{provider:'google-antigravity',model:'gemini-3.8-flash'}}]};
async function hostModule(){
 const core=await import(pathToFileURL(path.join(__dirname,'../core.js')).href);
 const pool=await import(pathToFileURL(path.join(__dirname,'../pool.js')).href);
 const schema=require(root+'@deepseek-ai/schemastery'),z=schema.default||schema;
 const source=fs.readFileSync(path.join(__dirname,'../index.js'),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
 return vm.runInNewContext(source+'\n({apply,Config,inject})',{z,...core,...pool,AbortController,AbortSignal});
}
test('native Schemastery accepts optional reviewer and validates bounds',{skip:!native},async()=>{
 const host=await hostModule();
 const defaults=host.Config({}).state.get();assert.equal(defaults.activePresetId,'');assert.equal(defaults.presets.length,0);
 const configured=host.Config({state:fixture}).state.get();assert.equal(configured.presets[0].executor.model,'gemini-3.8-flash');assert.equal(configured.presets[0].reviewer,undefined);
 assert.throws(()=>host.Config({state:{presets:[{...fixture.presets[0],executor:{provider:'x'}}]}}));
 assert.throws(()=>host.Config({state:{presets:Array(17).fill(fixture.presets[0])}}));
 assert.throws(()=>host.Config({state:{presets:[{...fixture.presets[0],name:'x'.repeat(81)}]}}));
 for(const bad of [{...fixture,secret:'not-allowed'},{...fixture,activePresetId:'missing'},{presets:[fixture.presets[0],fixture.presets[0]]},{presets:[{...fixture.presets[0],apiKey:'not-allowed'}]},{presets:[{...fixture.presets[0],executor:{...fixture.presets[0].executor,accessToken:'not-allowed'}}]},{presets:[{...fixture.presets[0],name:'control\n'}]}]) assert.throws(()=>host.Config({state:bad}));
});
test('native SettingsForms persists atomic validated state and enforces CAS',{skip:!native},async()=>{
 const {Config}=await hostModule(),{SettingsForms}=require(root+'@deepseek-ai/dsh-settings/lib/index.js');
 let stored={state:{activePresetId:'',presets:[]}},writes=0;
 const fiber={uid:'model-hub-fixture',state:2,runtime:{Config},effectiveConfig:Config(stored)};fiber.ctx={fiber};
 const entry={id:'model-hub-fixture',options:{id:'model-hub',config:stored},fiber};fiber.entry=entry;
 const settings=Object.create(SettingsForms.prototype);settings.revisions=new Map();settings.presentations=new Map();settings.invalidate=()=>{};
 settings.ownerContext={emit(){},configEditor:{configuration:()=>[{entry,inherited:{},override:stored}],entries:()=>[entry],edit:async(_entry,change)=>{
  const next=change(stored,{});Config(next);stored=JSON.parse(JSON.stringify(next));writes++;entry.options.config=stored;fiber.effectiveConfig=Config(stored);
 }}};
 const before=settings.describe().find(x=>x.ns==='model-hub');assert.equal(before.value.state.presets.length,0);
 await settings.mutate('model-hub',[{op:'set',path:['state'],value:fixture}],before.revision);
 assert.equal(writes,1);assert.equal(stored.state.activePresetId,'demo');
 const after=settings.describe().find(x=>x.ns==='model-hub');assert.equal(after.value.state.presets[0].executor.model,'gemini-3.8-flash');
 assert.doesNotThrow(()=>JSON.stringify(after));
 await assert.rejects(settings.mutate('model-hub',[{op:'set',path:['state'],value:{...fixture,apiKey:'never-store'}}],after.revision));
 await assert.rejects(settings.mutate('model-hub',[{op:'set',path:['state'],value:{...fixture,activePresetId:'missing'}}],after.revision));
 await assert.rejects(settings.mutate('model-hub',[{op:'set',path:['apiKey'],value:'never-store'}],after.revision));
 await assert.rejects(settings.mutate('model-hub',[{op:'set',path:['state'],value:{activePresetId:'',presets:[]}}],before.revision),e=>e.name==='SettingsConflictError');
 assert.equal(writes,1);assert.ok(!JSON.stringify(stored).includes('never-store'));
});
test('host registers only two read-only tools and disposes pending metadata work',{skip:!native},async()=>{
 const {apply}=await hostModule();const tools=new Map(),disposers=[];let customized, presentationDisposed=false;
 let began;const ready=new Promise(resolve=>began=resolve);
 const ctx={fiber:{},systemPrompt:{section(){return()=>{};}},settings:{configure(options){customized=options;return()=>{presentationDisposed=true;};}},effect(fn){disposers.push(fn());},tools:{register(tool){tools.set(tool.name,tool);return()=>tools.delete(tool.name);}},llm:{
  listProviders(){return [{id:'openai-codex'},{id:'google-antigravity'}];},listModels(){began();return new Promise(()=>{});},
  prepareCall(){throw Error('must not prepare inference');}
 }};
 const configuration={state:{get:()=>fixture}};
 apply(ctx,configuration);assert.equal(customized.auto,false);assert.equal(tools.size,2);
 const definition=tools.get('model_hub_routes');assert.equal(definition.isConcurrencySafe(),true);
 assert.deepEqual([...Object.keys(definition.parameters.properties)],['preset']);
 const result=definition.execute({},{});await ready;for(const dispose of disposers.reverse())dispose?.();
 await assert.rejects(result,{name:'AbortError'});assert.equal(tools.size,0);assert.equal(presentationDisposed,true);
});
test('host redacts malformed config and never forwards arbitrary execution options',{skip:!native},async()=>{
 const {apply}=await hostModule();let tool;
 const ctx={fiber:{},systemPrompt:{section(){return()=>{};}},settings:{configure(){}},effect(fn){fn();},tools:{register(value){tool=value;return()=>{};}},llm:{listProviders(){throw Error('credential=NEVER_ECHO');}}};
 apply(ctx,{state:{get:()=>fixture}});
 const invalid=await tool.execute({prompt:'run a model',provider:'other'},{});assert.equal(invalid.ok,false);assert.equal(invalid.error.code,'INVALID_INPUT');
 const failed=await tool.execute({},{});assert.equal(failed.ok,false);assert.ok(!JSON.stringify(failed).includes('NEVER_ECHO'));
});
test('already-resolved metadata cannot commit after immediate abort or dispose',{skip:!native},async()=>{
 const {apply}=await hostModule();
 for(const kind of ['abort','dispose']) {
  let tool;const disposers=[],control=new AbortController();
  const ctx={fiber:{},systemPrompt:{section(){return()=>{};}},settings:{configure(){return()=>{};}},effect(fn){disposers.push(fn());},tools:{register(value){tool=value;return()=>{};}},llm:{listProviders(){throw Error('empty state must not query metadata');}}};
  apply(ctx,{state:{get:()=>({activePresetId:'',presets:[]})}});
  const pending=tool.execute({}, {signal:control.signal});
  if(kind==='abort') control.abort(); else for(const dispose of disposers.reverse()) dispose?.();
  await assert.rejects(pending,{name:'AbortError'});
 }
});
test('pool guidance respects visible tools and performs no prompt-time metadata I/O',{skip:!native},async()=>{
 const {apply}=await hostModule(),tools=new Map(),disposers=[];let section;
 const ctx={fiber:{},settings:{configure(){return()=>{};}},effect(fn){disposers.push(fn());},
  systemPrompt:{section(value){section=value;return()=>{section=undefined;};}},
  tools:{register(value){tools.set(value.name,value);return()=>tools.delete(value.name);},get(name,scope,set){assert.equal(scope,'scoped');return set?.has(name)?tools.get(name):undefined;}},
  llm:{listProviders(){throw Error('Prompt must not perform metadata work');}}};
 apply(ctx,{state:{get(){throw Error('Prompt must not read full saved data');}}});
 const names=new Set(['model_hub_pool','subagent']);tools.set('subagent',{});
 assert.equal(section.interpolate,false);assert.ok(Number.isFinite(section.order));
 assert.match(section.text({scope:'scoped',toolSet:names}),/dynamically choose/);
 assert.match(section.text({scope:'scoped',toolSet:names}),/THIS session/);
 assert.equal(section.text({scope:'scoped',toolSet:new Set(['subagent'])}),'');
 tools.delete('subagent');assert.equal(section.text({scope:'scoped',toolSet:names}),'');
 for(const dispose of disposers.reverse())dispose?.();assert.equal(section,undefined);
});
test('pool reader also rejects late success on cancellation or plugin disposal',{skip:!native},async()=>{
 const {apply}=await hostModule();
 for(const kind of ['abort','dispose']) {
  const tools=new Map(),disposers=[],control=new AbortController();
  const ctx={fiber:{},systemPrompt:{section(){return()=>{};}},settings:{configure(){return()=>{};}},effect(fn){disposers.push(fn());},
   tools:{register(value){tools.set(value.name,value);return()=>tools.delete(value.name);}},llm:{listProviders(){return [];}}};
  apply(ctx,{state:{get:()=>({})}});
  const pending=tools.get('model_hub_pool').execute({}, {signal:control.signal});
  if(kind==='abort')control.abort();else for(const dispose of disposers.reverse())dispose?.();
  await assert.rejects(pending,{name:'AbortError'});
 }
});
test('actual native policy remains immutable and only fresh roots sample user settings',{skip:!native},async()=>{
 const {Service}=require(root+'@deepseek-ai/cordis'),schema=require(root+'@deepseek-ai/schemastery');
 const z=schema.default||schema,{z:zod}=require(root+'zod');
 const source=fs.readFileSync(root+'@deepseek-ai/dsh-tool-subagent/lib/model-selection-settings.js','utf8').replace(/^import .*;\n/gm,'').replace(/^export .*;\n?/gm,'');
 const {Owner,definition}=vm.runInNewContext(source+'\n({Owner:SubagentModelSelectionConfig,definition:subagentModelSelectionProjectionDefinition})',{Service,z,z$1:zod,SessionSeq:n=>n});
 const policies=new Map(),sessions=new Map();let onCreated;
 const old=[{provider:'openai-codex',model:'gpt-test'}],expanded=[...old,{provider:'google-antigravity',model:'gemini-3.8-flash'}];
 let enabled=true,allowed=expanded;
 const ctx={sessionProjections:{register(){return Promise.resolve({stateOf:s=>policies.get(s.id)??null});}},sessions:{get:id=>sessions.get(id)},fiber:{assertActive(){}},on(name,fn){assert.equal(name,'agent/created');onCreated=fn;}};
 const owner={ctx,config:{enabled:{get:()=>enabled},allowedModels:{get:()=>allowed}},current:Owner.prototype.current};
 await Owner.prototype[Service.init].call(owner);
 function session(id,header={},firstLiveSeq=0,seed=false){const s={id,header,firstLiveSeq,eventAt:()=>seed?{type:'session/end-seed'}:undefined,append(type,data){policies.set(id,definition.apply(policies.get(id)??null,{type,data}));}};sessions.set(id,s);return s;}
 const existing=session('existing');policies.set(existing.id,old);
 await onCreated({agent:{session:existing}});assert.deepEqual(policies.get(existing.id),old);
 const fresh=session('fresh');await onCreated({agent:{session:fresh}});assert.equal(policies.get(fresh.id).length,2);
 const child=session('child',{origin:'subagent',parentSession:'existing'});await onCreated({agent:{session:child}});assert.equal(policies.get(child.id).length,1);
 const resumed=session('resumed',{},9);await onCreated({agent:{session:resumed}});assert.equal(policies.has(resumed.id),false);
 const seeded=session('seeded',{},0,true);await onCreated({agent:{session:seeded}});assert.equal(policies.has(seeded.id),false);
 assert.equal(definition.apply(old,{type:'subagent/model-selection-policy',data:{allowedModels:expanded}}),old);
 enabled=false;const disabled=session('disabled');await onCreated({agent:{session:disabled}});assert.equal(policies.has(disabled.id),false);
 enabled=true;allowed=[];assert.throws(()=>owner.current(),/at least one/);
});

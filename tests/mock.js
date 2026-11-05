window.google={script:{run:(function(){
 const data={today:'2026-11-05',date:'2026-11-05',defaultDay:'Upper B',unit:'kg',
 days:[{name:'Upper A',code:'D1',exercises:[{order:1,name:'Hammer Strenght iso-lateral incline bench',muscle:'chest',sets:2,min:6,max:10,rir:'2-3',notes:'Priorità: parte alta del petto.',pending:false}]},
 {name:'Lower A (Quad)',code:'D2',exercises:[
 {order:1,name:'Atlantis hack squat (PW412)',muscle:'quads',sets:2,min:6,max:10,rir:'0-1',notes:'Pressa principale quadricipiti. Piedi bassi, ROM completo, mezzo secondo fermo. Bacino appoggiato; regola il fermo di sicurezza alla profondità scelta.',pending:false},
 {order:2,name:'Hammer Strenght Leg extension',muscle:'quads',sets:1,min:10,max:15,rir:'0-1',notes:'Tensione distribuita su tutto il movimento.',pending:false},
 {order:3,name:'Leg extension plates loaded',muscle:'quads',sets:1,min:10,max:15,rir:'0-1',notes:'',pending:false},
 {order:4,name:'Hammer Strength seated leg curl',muscle:'hamstrings',sets:0,min:8,max:12,rir:'0-1',notes:'Fuori piano',pending:false},
 {order:5,name:'Adductor machine',muscle:'adductors',sets:2,min:10,max:15,rir:'0-1',notes:'',pending:false},
 {order:6,name:'Hammer Strength Select Standing Calf',muscle:'calves',sets:1,min:10,max:15,rir:'0-1',notes:'',pending:false}]},
 {name:'Upper B',code:'D3',exercises:[{order:1,name:'Hammer Strenght Select lateral raises',muscle:'lateral delts',sets:2,min:12,max:20,rir:'2-3',notes:'Priorità spalle. Movimento controllato.',pending:false},{order:2,name:'Gymleco 030 shoulder press',muscle:'shoulders',sets:2,min:6,max:10,rir:'2-3',notes:'',pending:false}]},{name:'Lower B (Ham)',code:'D4',exercises:[]}],
 done:{'Upper B':{'Hammer Strenght Select lateral raises':[{set:1,kg:20,reps:16,rir:2}]},'Lower A (Quad)':{'Atlantis hack squat (PW412)':[{set:1,kg:80,reps:9,rir:0,undo:true}]}},
 last:{'Hammer Strenght Select lateral raises':{date:'2026-11-04',sets:[{set:1,kg:20,reps:16,rir:0},{set:2,kg:25,reps:10,rir:0}]},'Atlantis hack squat (PW412)':{date:'2026-10-29',sets:[{set:1,kg:40,reps:10,rir:1},{set:2,kg:40,reps:10,rir:0}]},'Adductor machine':{date:'2026-11-04',sets:[{set:1,kg:103,reps:15,rir:1},{set:2,kg:110,reps:11,rir:0}]}}};
 function mk(ok,fail){return new Proxy({}, {get(_,fn){ if(fn==='withSuccessHandler')return h=>mk(h,fail); if(fn==='withFailureHandler')return h=>mk(ok,h);
  return (...a)=>setTimeout(()=>{ if(fn==='gymAppData')ok(JSON.parse(JSON.stringify(data)));
   else if(fn==='gymAppSaveSet'||fn==='gymAppUpdateSet'){const p=a[0]; ok(p.kg>150&&!p.force?{ok:false,unitWarn:true,msg:'set 2 (200 kg sembra un errore di unità)'}:{ok:true,set:{set:p.set,kg:p.kg,reps:p.reps,rir:p.rir,undo:true}});}
   else ok({ok:true});},150);}});}
 return mk(()=>{},()=>{});})()}};

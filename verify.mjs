import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const course=JSON.parse(readFileSync('course-vocabulary.json','utf8'));
const source=readFileSync('dist/app.js','utf8');
let checks=0;
function ok(value,message){assert.ok(value,message);checks++;}
function environment(saved=new Map()){
 const nodes=new Map(),tools=new Map(),events=new Map(),utterances=[];
 const get=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:id==='question-limit'?'10':'',disabled:false,classList:{add(){},remove(){},toggle(){}},focus(){},events:new Map(),addEventListener(n,f){this.events.set(n,f);},querySelector(){return{disabled:false}}});return nodes.get(id);};
 const document={getElementById:get,querySelectorAll:()=>[],addEventListener:(n,f)=>events.set(n,f),modelContext:{registerTool:t=>tools.set(t.name,t)}};
 const speechSynthesis={cancel:()=>{utterances.length=0;},getVoices:()=>[{lang:'en-US'}],speak:u=>utterances.push(u)};
 const window={PVQC_COURSE:course,speechSynthesis,SpeechSynthesisUtterance:function(text){this.text=text;},addEventListener(){}};
 const ctx=vm.createContext({window,document,localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},speechSynthesis,SpeechSynthesisUtterance:window.SpeechSynthesisUtterance,AbortController,console,setInterval:()=>1,clearInterval(){},setTimeout:()=>1,clearTimeout(){},Date,Math});
 vm.runInContext(source,ctx);
 const call=(name,input={})=>tools.get(name).execute(input);
 const click=dataset=>events.get('click')({target:{closest:()=>({dataset,disabled:false})}});
 const decode=s=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
 function current(){
  const html=get('activity').innerHTML,g=call('read_practice_state').gate;
  const term=decode(html.match(/<div class="term">([^<]*)<\/div>/)?.[1]||'');
  const spoken=w=>/^[A-Z0-9]{2,8}$/.test(w.english)?w.english.split('').join(' '):w.english;
  let word=g===1||g===5?course.words.find(w=>w.chinese===term):course.words.find(w=>w.english===term);
  if(g===1){const length=Number(html.match(/共 (\d+) 個字元/)?.[1]);word=course.words.find(w=>w.chinese===term&&w.english.length===length);}
  if(g===3||g===4)word=course.words.find(w=>spoken(w)===utterances.at(-1)?.text);
  if(g===5||g===6){while(utterances.at(-1)?.onend&&utterances.length<4)utterances.at(-1).onend();if(g===5)word=course.words.find(w=>w.chinese===term&&utterances.some(u=>u.text===spoken(w)));}
  const choices=[...html.matchAll(/data-answer="(\d)"[^>]*><span class="option-letter">\d<\/span>([^<]*)<\/button>/g)].map(m=>({index:Number(m[1])+1,text:decode(m[2])}));
  const choice=g===5||g===6?utterances.findIndex(u=>u.text===spoken(word))+1:choices.find(c=>c.text===(g===2||g===3?word.chinese:word.english))?.index;
  return{word,choice,html,g};
 }
 return{get,call,click,current,saved,utterances};
}
const app=environment();ok(app.call('read_practice_state').words===645,'All 645 source rows loaded');
ok(course.words.find(w=>w.english==='DOS').chinese!==course.words.find(w=>w.english==='DoS').chinese,'Case-sensitive entries retained');
assert.throws(()=>app.call('start_pvqc_gate',{gate:7}));checks++;
ok(app.call('read_practice_state').view==='home','Invalid start does not change state');
for(let gate=1;gate<=6;gate++){
 app.call('start_pvqc_gate',{gate});const q=app.current();ok(!!q.word,`Gate ${gate} target identified from visible prompt or audio`);
 if(gate===3||gate===4)ok(!q.html.includes('class="term"'),'Listening question hides written target');
 if(gate===5||gate===6){ok(q.html.includes('data-play="3"'),'Four audio replay controls');ok(!/data-answer="\d"[^>]*>[^]*?option-letter[^]*?<\/span>\s*[a-zA-Z]/.test(q.html),'Audio choice labels hide English');ok(app.utterances.length===4,'Audio choices play in sequence');}
 assert.throws(()=>app.call('submit_pvqc_answer',gate===1?{spelling:''}:{choice:0}));checks++;
 ok(!app.call('read_practice_state').answered,'Invalid answer does not mark question');
 const input=gate===1?{spelling:' '+q.word.english.toUpperCase()+' '}:{choice:q.choice};
 ok(app.call('submit_pvqc_answer',input).correct,`Gate ${gate} correct answer scores correctly`);
 ok(app.get('feedback').innerHTML.includes('答對了'),'Visible correct feedback');
 assert.throws(()=>app.call('submit_pvqc_answer',input));checks++;
}
app.call('start_pvqc_gate',{gate:1});const missed=app.current().word;
ok(!app.call('submit_pvqc_answer',{spelling:'a deliberately incorrect answer'}).correct,'Wrong spelling rejected');
ok(app.call('read_practice_state').mistakes===1,'Wrong question stored');
const reopened=environment(app.saved);ok(reopened.call('read_practice_state').mistakes===1,'Mistake persists after reopening');
reopened.click({review:'1'});ok(reopened.call('read_practice_state').gate===1,'Review preserves original gate');
ok(reopened.call('submit_pvqc_answer',{spelling:missed.english}).correct,'Review accepts corrected spelling');
ok(reopened.call('read_practice_state').mistakes===0,'Correct review removes only its mistake');
reopened.click({action:'next'});ok(reopened.get('activity').innerHTML.includes('100'),'One-word review produces 100 percent result');
const continuous=environment();continuous.click({action:'continuous'});
for(let gate=1;gate<=6;gate++){
 ok(continuous.call('read_practice_state').gate===gate,'Continuous mode gate order');
 for(let n=0;n<10;n++){const q=continuous.current();const result=continuous.call('submit_pvqc_answer',gate===1?{spelling:q.word.english}:{choice:q.choice});ok(result.correct,'Continuous answer accepted gate '+gate+' question '+(n+1)+' word '+q.word.english);continuous.click({action:'next'});}
 ok(continuous.get('activity').innerHTML.includes('本關練習完成'),'Gate completion visible');
 if(gate<6)continuous.click({action:'next-gate'});
}
ok(continuous.get('activity').innerHTML.includes('第 6 關 看英選發音'),'Six-gate summary includes final gate');
const importing=environment();importing.click({view:'bank'});const original=importing.get('bank-text').value;
importing.get('bank-text').value='english,chinese\nonly one column';importing.click({action:'import'});
ok(importing.get('import-error').textContent.length>0,'Invalid import displays error');ok(importing.call('read_practice_state').words===645,'Invalid import preserves bank');
// Each biweekly group must cover its exact source range, once per word.
function selectQuiz(app,index){app.click({view:'quiz'});app.get('quiz-group').value=String(index);app.get('quiz-group').events.get('change')();app.click({action:'start-quiz'});}
function quizWord(app,pool){const html=app.get('activity').innerHTML;const length=Number(html.match(/共 (\d+) 個字元/)?.[1]);const term=html.match(/<div class="term">([^<]*)<\/div>/)?.[1];return pool.find(w=>w.chinese===term&&w.english.length===length);}
const quiz=environment();quiz.click({view:'quiz'});
ok(quiz.get('activity').innerHTML.includes('第 13 組 · 序號 601–645 · 45 個'),'All thirteen sequential groups displayed');
for(let group=0;group<13;group++){
 selectQuiz(quiz,group);const pool=course.words.slice(group*50,group*50+50),ids=new Set();
 ok(quiz.call('read_practice_state').total===pool.length,'Quiz count matches group '+(group+1));
 ok(quiz.call('read_practice_state').quiz.group===group+1,'Quiz selection preserved');
 for(let n=0;n<pool.length;n++){
  const w=quizWord(quiz,pool);ok(!!w,'Quiz prompt belongs to selected group');
  ok(quiz.call('submit_pvqc_answer',{spelling:w.english}).correct,'In-range answer accepted');
  const id=Number(quiz.get('feedback').innerHTML.match(/原序號 (\d+)/)?.[1]);ids.add(id);quiz.click({action:'next'});
 }
 ok(ids.size===pool.length&&pool.every(w=>ids.has(w.id)),'Every source word appears exactly once');
 ok(quiz.get('activity').innerHTML.includes('小考練習完成')&&quiz.get('activity').innerHTML.includes(`答對 ${pool.length} / ${pool.length}`),'Quiz result totals correct');
}
quiz.click({action:'retry-quiz'});ok(quiz.call('read_practice_state').total===45,'Retry retains last group scope');
const mixed=environment();selectQuiz(mixed,1);const pool=course.words.slice(50,100);let missedQuiz;
for(let i=0;i<50;i++){const w=quizWord(mixed,pool);if(i===0){missedQuiz=w;mixed.call('submit_pvqc_answer',{spelling:'<script>wrong</script>'});}else mixed.call('submit_pvqc_answer',{spelling:w.english});mixed.click({action:'next'});}
ok(mixed.get('activity').innerHTML.includes('答對 49 / 50'),'Mixed quiz score correct');
ok(mixed.get('activity').innerHTML.includes('&lt;script&gt;wrong&lt;/script&gt;')&&!mixed.get('activity').innerHTML.includes('<script>wrong'),'Wrong input rendered as text');
ok(mixed.call('read_practice_state').mistakes===1,'Quiz adds spelling mistake');
mixed.click({action:'review-quiz'});ok(mixed.call('read_practice_state').total===1&&mixed.call('read_practice_state').quiz.review,'Quiz review includes only this attempt mistakes');
mixed.call('submit_pvqc_answer',{spelling:missedQuiz.english});mixed.click({action:'next'});
ok(mixed.call('read_practice_state').mistakes===0,'Correct quiz review clears matching spelling mistake');
mixed.click({action:'retry-quiz'});ok(mixed.call('read_practice_state').total===50&&mixed.call('read_practice_state').quiz.group===2,'Full retry after review restores original 50');
mixed.click({view:'quiz'});ok(mixed.get('activity').innerHTML.includes('value="1" selected'),'Return preserves selected group');
const importedQuiz=environment(new Map([['pvqc-computing-v1',JSON.stringify({bank:[...course.words.slice(0,100)].reverse(),source:'reordered',mistakes:[]})]]));
selectQuiz(importedQuiz,0);ok(!!quizWord(importedQuiz,course.words.slice(0,50)),'Groups use original IDs even with reordered bank');
const noIds=environment(new Map([['pvqc-computing-v1',JSON.stringify({bank:course.words.slice(0,51).map(({english,chinese})=>({english,chinese})),source:'no IDs',mistakes:[]})]]));
noIds.click({view:'quiz'});ok(noIds.get('activity').innerHTML.includes('第 51–51 筆 · 1 個'),'Unnumbered import explicitly groups by row order');
const report={source_rows:645,case_sensitive_unique:645,chinese_meanings:605,checks,passed:true,scope:'Six-gate behavior, audio sequence and sequential biweekly spelling quizzes, including all 645 words, partial final group, scoring, wrong-word review, retry and imported order. Browser UI checked separately; real audio and classroom scoring unverified.'};
writeFileSync('verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));

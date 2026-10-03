'use strict';
(() => {
const GATES = [
 {id:1,name:'看中拼英',skill:'SPELLING',description:'看中文詞義，輸入英文拼字。',prompt:'請拼出對應的英文詞彙',sound:'none'},
 {id:2,name:'看英選中',skill:'READING',description:'看英文詞彙，選出中文詞義。',prompt:'選出正確的中文意思',sound:'none'},
 {id:3,name:'聽英選中',skill:'LISTENING',description:'聽英文發音，選出中文詞義。',prompt:'聽英文，選出正確的中文意思',sound:'question'},
 {id:4,name:'聽英選英',skill:'LISTENING',description:'聽英文發音，選出英文詞彙。',prompt:'聽英文，選出正確的英文詞彙',sound:'question'},
 {id:5,name:'看中選發音',skill:'MATCHING',description:'看中文詞義，選出英文發音。',prompt:'看中文，選出正確的英文發音',sound:'options'},
 {id:6,name:'看英選發音',skill:'MATCHING',description:'看英文詞彙，選出相同的發音。',prompt:'看英文，選出相同的英文發音',sound:'options'}
];
const KEY='pvqc-computing-v1';
const COURSE=window.PVQC_COURSE;
const $=id=>document.getElementById(id);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalized=s=>s.trim().normalize('NFC').toLowerCase();
const wordKey=w=>JSON.stringify([w.english,w.chinese]);
let bank=[],mistakes=[],source='',view='home',session=null,audioGeneration=0;
let persistWarning=false,timer=null,noticeTimer=null,quizGroup=0;
const audioSupported='speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
try { const saved=JSON.parse(localStorage.getItem(KEY)||'null'); if(saved){bank=validateBank(saved.bank);source=String(saved.source||'課程題庫');mistakes=Array.isArray(saved.mistakes)?saved.mistakes.filter(m=>bank.some(w=>wordKey(w)===m.key)&&GATES.some(g=>g.id===m.gate)):[];} } catch {bank=[];mistakes=[];source='';}
if(!bank.length&&COURSE){bank=validateBank(COURSE.words);source=COURSE.name;}
function persist(){try{localStorage.setItem(KEY,JSON.stringify({bank,source,mistakes}));}catch{persistWarning=true;announce('目前無法儲存至此瀏覽器；關閉頁面後資料可能消失。');}}
function announce(message){clearTimeout(noticeTimer);$('status-message').textContent=message;noticeTimer=setTimeout(()=>{$('status-message').textContent='';},5000);}
function shuffle(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function validateBank(raw){
 if(!Array.isArray(raw))throw new Error('題庫需要是中英詞彙清單。');
 if(raw.length>10000)throw new Error('一次最多加入 10,000 個詞彙。');
 const words=[],seen=new Map();
 raw.forEach((r,i)=>{const english=String(r.english??r.en??'').trim(),chinese=String(r.chinese??r.zh??'').trim();
 if(!english||!chinese)throw new Error(`第 ${i+1} 筆缺少英文或中文。`);
 if(english.length>250||chinese.length>500)throw new Error(`第 ${i+1} 筆文字過長，請確認是否為詞彙。`);
 const key=english;
 if(seen.has(key)){if(seen.get(key)!==chinese)throw new Error(`「${english}」有兩種不同中文答案，請先確認課程的標準詞義。`);return;}
 seen.set(key,chinese);words.push({english,chinese,...(r.id?{id:r.id}:{}),...(r.pos?{pos:String(r.pos)}:{})});});return words;
}
function parseDelimited(text,delimiter){
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(quoted||field==='')quoted=!quoted;else field+=c;}
 else if(c===delimiter&&!quoted){row.push(field);field='';}
 else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(s=>s.trim()))rows.push(row);row=[];field='';}
 else field+=c;}
 if(quoted)throw new Error('CSV 引號沒有成對，請確認檔案格式。');row.push(field);if(row.some(s=>s.trim()))rows.push(row);return rows;
}
function parseBank(text){
 text=text.replace(/^\uFEFF/,'').trim();if(!text)throw new Error('請先加入中英詞彙。');
 if(text.startsWith('[')||text.startsWith('{')){let parsed;try{parsed=JSON.parse(text);}catch{throw new Error('JSON 格式無法讀取，請確認括號與引號。');}return validateBank(Array.isArray(parsed)?parsed:parsed.words??parsed.bank);}
 const first=text.split(/\r?\n/)[0],delimiter=first.includes('\t')?'\t':',';
 const rows=parseDelimited(text,delimiter);if(!rows.length)throw new Error('沒有可讀取的詞彙。');
 const headers=rows[0].map(normalized),eh=['english','en','英文','英文字彙','英文詞彙'],zh=['chinese','zh','中文','中文詞義','中文字義'];
 let ei=headers.findIndex(h=>eh.includes(h)),zi=headers.findIndex(h=>zh.includes(h));
 if(ei>=0&&zi>=0)rows.shift();else{ei=0;zi=1;}
 const pi=headers.findIndex(h=>['pos','詞性'].includes(h)),ii=headers.findIndex(h=>['id','序號'].includes(h));
 return validateBank(rows.map((r,i)=>{if(r.length<=Math.max(ei,zi))throw new Error(`第 ${i+1} 行沒有完整的中英兩欄；請使用逗號或 Tab 分隔。`);return{english:r[ei],chinese:r[zi],...(pi>=0&&r[pi]?{pos:r[pi]}:{}),...(ii>=0&&r[ii]?{id:Number(r[ii])}:{})};}));
}
function stopAudio(){audioGeneration++;if(audioSupported)speechSynthesis.cancel();}
function updateChrome(){
 $('bank-total').textContent=bank.length;$('mistake-count').textContent=mistakes.length;$('mistake-count').hidden=mistakes.length===0;
 const titles={home:'六關練習',quiz:'小考練習',bank:'我的題庫',mistakes:'錯題複習',session:session?.quiz?'小考 · 看中拼英':session?`第 ${session.gate} 關 · ${GATES[session.gate-1].name}`:'六關練習'};
 $('page-title').textContent=titles[view];$('breadcrumb').textContent=titles[view];
 $('page-description').textContent=({home:'同一份詞彙，練習六種看字與聽音能力。',quiz:'每兩週一組，依序練熟 50 個英文詞彙。',bank:'保留課程的原始英文與中文詞義。',mistakes:'回到答錯的題型，再練一次。',session:session?.quiz?`${session.quiz.label} · ${session.quiz.review?'本次錯字複習':'逐題作答，立即核對拼字。'}`:'依照題目指示作答；聽音選項不顯示英文。'})[view];
 document.querySelectorAll('nav .nav-item').forEach(b=>{const selected=b.dataset.view===view||(view==='session'&&b.dataset.view===(session?.quiz?'quiz':'home'));b.classList.toggle('active',selected);if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
}
function setView(next){if(!['home','quiz','bank','mistakes'].includes(next))return;stopAudio();clearInterval(timer);session=null;view=next;updateChrome();render();}
function canChoose(){return new Set(bank.map(w=>w.chinese)).size>=4&&bank.length>=4;}
function render(){if(view==='home')renderHome();else if(view==='quiz')renderQuiz();else if(view==='bank')renderBank();else if(view==='mistakes')renderMistakes();else renderQuestion();}
function quizGroups(){
 const numbered=bank.every(w=>Number.isInteger(Number(w.id))&&Number(w.id)>0)&&new Set(bank.map(w=>Number(w.id))).size===bank.length;
 const ordered=numbered?[...bank].sort((a,b)=>Number(a.id)-Number(b.id)):[...bank],groups=[];
 for(let i=0;i<ordered.length;i+=50){const words=ordered.slice(i,i+50);groups.push({words,label:numbered?`序號 ${words[0].id}–${words.at(-1).id}`:`第 ${i+1}–${i+words.length} 筆`});}
 return groups;
}
function renderQuiz(){
 const groups=quizGroups();if(!groups.length){$('activity').innerHTML='<div class="empty"><h2>先加入課程題庫</h2><p>加入詞彙後，會依序分成每組 50 個的小考範圍。</p><button class="primary" data-view="bank">加入題庫</button></div>';return;}
 quizGroup=Math.min(quizGroup,groups.length-1);const group=groups[quizGroup];
 $('activity').innerHTML=`<div class="bank-banner"><div><strong>兩週小考 · 看中拼英</strong><p>看中文，自己輸入英文。每組依題庫序號接續，組內隨機出題。</p></div><span class="quiz-count"><strong>${group.words.length}</strong> 個詞彙</span></div><div class="bank-editor quiz-setup"><h2>選擇這次小考範圍</h2><label class="input-label" for="quiz-group">小考組別</label><select id="quiz-group">${groups.map((g,i)=>`<option value="${i}" ${i===quizGroup?'selected':''}>第 ${i+1} 組 · ${escape(g.label)} · ${g.words.length} 個</option>`).join('')}</select><p>${group.words.length<50?`最後一組剩下 ${group.words.length} 個詞彙，全部出題，不補入其他組的詞彙。`:'本次會練完整 50 個詞彙，不重複抽題。'}作答後立即顯示答案；答錯的詞彙也會加入錯題複習。</p><button class="primary" data-action="start-quiz">開始本組 ${group.words.length} 題</button><details class="quiz-vocabulary"><summary>先複習本組詞彙（${group.words.length} 個）</summary><ol>${group.words.map((w,i)=>`<li><span class="quiz-word-number">${escape(w.id||quizGroup*50+i+1)}</span><strong>${escape(w.english)}</strong><span>${escape(w.chinese)}</span></li>`).join('')}</ol></details><p class="storage-note">不限時練習，提供字元數提示；判分忽略大小寫與頭尾空白。實際小考時間與評分依老師規定。</p></div>`;
 $('quiz-group').addEventListener('change',()=>{const selected=Number($('quiz-group').value);if(Number.isInteger(selected)&&groups[selected]){quizGroup=selected;renderQuiz();$('quiz-group').focus();}});
}
function startQuiz(groupIndex=quizGroup){
 const group=quizGroups()[groupIndex];if(!Number.isInteger(groupIndex)||!group)throw new Error('找不到這個小考範圍。');quizGroup=groupIndex;
 beginSession({gate:1,continuous:false,review:false,limit:group.words.length,questions:shuffle(group.words),quiz:{groupIndex,label:group.label,pool:group.words,review:false}});
}
function retryQuiz(onlyWrong=false){
 if(!session?.quiz||!session.finished)return;const quiz={...session.quiz,review:onlyWrong},pool=onlyWrong?session.answers.filter(a=>!a.correct).map(a=>a.word):quiz.pool;
 if(!pool.length)throw new Error('本次沒有錯字，已經全部答對。');
 beginSession({gate:1,continuous:false,review:onlyWrong,limit:pool.length,questions:shuffle(pool),quiz});
}
function beginSession(config){
 stopAudio();clearInterval(timer);session={...config,index:0,answers:[],answered:false,options:[],started:Date.now(),summaries:[],finished:false};
 view='session';updateChrome();renderQuestion();timer=setInterval(()=>{if($('elapsed')&&session)$('elapsed').textContent=duration(Date.now()-session.started);},1000);
}
function renderHome(){
 $('activity').innerHTML=`${!bank.length?`<div class="bank-banner"><div><strong>先加入你的課程題庫</strong><p>六關會使用同一份計算機中英詞彙清單。</p></div><button class="primary" data-view="bank">加入題庫</button></div>`:`<div class="bank-banner loaded"><div><strong>${escape(source)}</strong><p>${bank.length} 個詞彙 · 已內建課程清單</p></div><button class="secondary" data-view="bank">查看題庫</button></div>`}
 <div class="practice-toolbar"><label>每關題數 <select id="question-limit"><option value="10">10 題</option><option value="20">20 題</option><option value="all">全部詞彙</option></select></label><button class="primary" data-action="continuous" ${!canChoose()?'disabled':''}>六關連續練習</button></div>
 <div class="gate-grid">${GATES.map(g=>`<button class="gate-card" data-gate="${g.id}" ${(!bank.length||(g.id>1&&!canChoose())||(g.sound!=='none'&&!audioSupported))?'disabled':''}><span class="gate-top"><span class="gate-number">0${g.id}</span><span class="gate-skill">${g.skill}</span></span><h2>${g.name}</h2><p>${g.description}</p><span class="gate-bottom">${g.id===1?'英文輸入':'四選一'}<span>${g.sound==='none'?'文字題型':'聲音題型'}</span></span></button>`).join('')}</div>
 <div class="home-notes"><p class="storage-note">練習題數會依題庫數量調整。${bank.length&&!canChoose()?'選擇題至少需要 4 個英文詞彙與 4 種不同中文詞義。':''} ${!audioSupported?'此瀏覽器不支援語音，請改用支援語音的瀏覽器練習第 3–6 關。':''}</p><p class="storage-note">詞義保留課程清單原文；若與其他教材不同，請先向老師確認。</p></div>
 <details class="rules-note"><summary>練習模式與正式測驗的差別</summary><p>這裡依測評說明提供六種題型。選項由匯入詞彙產生，語音為瀏覽器朗讀，不是官方原題或原版錄音。本版為不限時練習，成績是本回合的答對比例，不能當作證照成績。</p><p>所參考的測評說明列出測驗一為 Spelling 加考，測驗二到六為必考。你的課程級別、題數、時限與採計方式仍須依老師提供的版本確認。</p></details>`;
}
function renderBank(){
 $('activity').innerHTML=`<div class="bank-editor"><h2>${bank.length?'你的課程詞彙':'加入計算機課程題庫'}</h2><p>貼上兩欄詞彙：英文在前、中文在後，以逗號或 Tab 分隔。也可讀取 CSV、TSV、TXT 或 JSON 檔案。</p><label class="file-control">讀取題庫檔案<input type="file" id="bank-file" accept=".csv,.tsv,.txt,.json"></label><label class="input-label" for="source-name">題庫名稱</label><input id="source-name" class="text-input" maxlength="150" value="${escape(source||'計算機課程題庫')}"><label class="input-label" for="bank-text">中英詞彙清單</label><textarea id="bank-text" rows="9" spellcheck="false" placeholder="english,chinese&#10;英文詞彙,對應的中文詞義">${bank.length?escape('id,english,chinese,pos\n'+bank.map(w=>[String(w.id||''),w.english,w.chinese,w.pos||''].map(csvCell).join(',')).join('\n')):''}</textarea><p id="import-error" role="alert" class="import-error"></p><div class="import-actions"><button class="primary" data-action="import">${bank.length?'儲存題庫':'加入題庫'}</button><button class="secondary" data-view="home">返回六關</button></div><p class="storage-note">PDF、Word 題庫請先整理成中英兩欄再匯入；有檔案時可交給聊天中的助理整理。儲存不同題庫會清除舊題庫的錯題紀錄。</p><p class="storage-note">題庫與錯題只保存在此裝置的瀏覽器，沒有帳號同步；清除網站資料會一併刪除。${persistWarning?'目前瀏覽器無法儲存資料。':''}</p></div>`;
 $('bank-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;if(file.size>5*1024*1024){$('import-error').textContent='檔案超過 5 MB，請先拆成較小的詞彙清單。';return;}try{$('bank-text').value=await file.text();$('source-name').value=file.name.replace(/\.[^.]+$/,'');$('import-error').textContent='已讀取檔案，請按「加入題庫」或「儲存題庫」完成匯入。';}catch{$('import-error').textContent='無法讀取檔案，請改為貼上詞彙清單。';}});
}
function csvCell(s){return '"'+s.replace(/"/g,'""')+'"';}
function importBank(){try{const next=parseBank($('bank-text').value);if(!next.length)throw new Error('題庫至少需要一個詞彙。');const changed=JSON.stringify(next)!==JSON.stringify(bank);bank=next;source=$('source-name').value.trim()||'計算機課程題庫';if(changed)mistakes=[];persist();setView('home');announce(`已加入 ${bank.length} 個課程詞彙。`);}catch(e){$('import-error').textContent=e.message;}}
function renderMistakes(){
 if(!mistakes.length){$('activity').innerHTML=`<div class="empty"><span class="empty-symbol" aria-hidden="true">✓</span><h2>目前沒有錯題</h2><p>練習中答錯的詞彙會出現在這裡，並保留對應的關卡。</p><button class="primary" data-view="home">前往六關練習</button></div>`;return;}
 const selected=mistakes.map(m=>({m,w:bank.find(w=>wordKey(w)===m.key)})).filter(x=>x.w);
 $('activity').innerHTML=`<p class="storage-note">${mistakes.length} 筆關卡錯題 · 答對後會從該關的錯題清單移除。</p><div class="mistake-list">${selected.map(({m,w})=>`<div class="mistake-row"><div><strong>${escape(w.english)}</strong><p>${escape(w.chinese)} · 第 ${m.gate} 關 ${GATES[m.gate-1].name}</p></div><button class="secondary" data-review="${m.gate}">複習此關</button></div>`).join('')}</div>`;
}
function start(gate,continuous=false,review=false){
 if(!GATES.some(g=>g.id===gate))throw new Error('找不到這個關卡。');
 if(!bank.length)throw new Error('請先加入課程題庫。');if(gate>1&&!canChoose())throw new Error('選擇題至少需要四個不同詞義。');if((gate>2||continuous)&&!audioSupported)throw new Error('此瀏覽器不支援語音朗讀。');
 const limit=$('question-limit')?.value||'10';const pool=review?bank.filter(w=>mistakes.some(m=>m.gate===gate&&m.key===wordKey(w))):bank;
 if(!pool.length)throw new Error('此關沒有待複習的錯題。');
 beginSession({gate,continuous,review,limit,questions:shuffle(pool).slice(0,limit==='all'?pool.length:Number(limit))});
}
function duration(ms){const s=Math.floor(ms/1000);return`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
function optionsFor(word,gate){const value=w=>gate===2||gate===3?w.chinese:normalized(w.english),seen=new Set([value(word)]),pool=[];for(const w of shuffle(bank)){if(gate===5&&w.chinese===word.chinese)continue;if(!seen.has(value(w))){seen.add(value(w));pool.push(w);}}return shuffle([word,...pool.slice(0,3)]);}
function renderQuestion(){
 if(!session)return;stopAudio();const s=session,g=GATES[s.gate-1],w=s.questions[s.index];s.answered=false;s.options=g.id===1?[]:optionsFor(w,g.id);
 const sound=g.sound==='question';const term=sound?'<div class="audio-question"><span aria-hidden="true">◖ ♪ ◗</span><button class="primary" data-action="play-question">播放題目</button></div>':`<div class="term">${escape(g.id===1||g.id===5?w.chinese:w.english)}</div>`;
 $('activity').innerHTML=`<div class="session-toolbar"><button class="quiet-button" data-view="${s.quiz?'quiz':'home'}">${s.quiz?'返回小考區':'返回六關'}</button><span>練習計時 <span id="elapsed">${duration(Date.now()-s.started)}</span></span></div><div class="question-meta"><span class="unit-tag">${s.quiz?escape(s.quiz.label)+(s.quiz.review?' · 錯字複習':''): '第 '+g.id+' 關 · '+g.name}</span><span>第 ${s.index+1} / ${s.questions.length} 題</span></div><div class="progress-track"><div style="width:${s.index/s.questions.length*100}%"></div></div><div class="question-card"><span class="question-instruction">${g.prompt}</span>${term}<p class="question-hint">${g.id===1?`共 ${w.english.length} 個字元（含空格）；練習判分忽略大小寫。`:g.sound==='options'?'先聽各選項，再選取答案。':sound?'可重播題目；答案公布前不顯示原英文。':'選取後會顯示正確答案。'}</p></div>
 ${g.id===1?`<form id="spelling-form"><label class="input-label" for="spelling">英文答案</label><div class="spelling-row"><input id="spelling" class="text-input" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" placeholder="輸入英文詞彙" required><button class="primary" type="submit">確認答案</button></div></form>`:`<div class="options">${s.options.map((option,i)=>g.sound==='options'?`<div class="audio-option" id="audio-option-${i}"><button class="speak" data-play="${i}" aria-label="播放選項 ${i+1}">♫ 播放 ${i+1}</button><button class="option audio-answer" data-answer="${i}" aria-label="選擇選項 ${i+1}"><span class="option-letter">${i+1}</span>選擇此發音</button></div>`:`<button class="option" data-answer="${i}"><span class="option-letter">${i+1}</span>${escape(g.id===2||g.id===3?option.chinese:option.english)}</button>`).join('')}</div>`}
 ${g.sound==='options'?'<button class="secondary" data-action="play-all">依序播放四個選項</button>':''}<p id="audio-message" class="audio-note" role="status"></p><div id="feedback" aria-live="polite"></div><div id="next-area"></div>`;
 if(g.id===1){$('spelling-form').addEventListener('submit',e=>{e.preventDefault();if($('spelling').value.trim())answer($('spelling').value);});$('spelling').focus();}
 if(sound)playQuestion();else if(g.sound==='options')playAll();
}
function answer(value){
 if(!session||session.answered||session.finished)return false;const s=session,w=s.questions[s.index],g=GATES[s.gate-1];
 if(g.id!==1&&(!Number.isInteger(value)||value<0||value>=s.options.length))throw new Error('選項必須是 1 到 4。');
 if(g.id===1&&(typeof value!=='string'||!value.trim()))throw new Error('請輸入英文答案。');
 stopAudio();const accepted=g.id===1?(s.quiz?s.quiz.pool:bank).filter(o=>o.chinese===w.chinese&&o.english.length===w.english.length):[w];const correct=g.id===1?accepted.some(o=>normalized(value)===normalized(o.english)):wordKey(s.options[value])===wordKey(w);s.answered=true;s.answers.push({word:w,correct,answer:value});
 const existing=mistakes.findIndex(m=>m.key===wordKey(w)&&m.gate===g.id);if(correct){if(existing>=0)mistakes.splice(existing,1);}else if(existing<0)mistakes.push({key:wordKey(w),gate:g.id});persist();updateChrome();
 document.querySelectorAll('[data-answer]').forEach(b=>{b.disabled=true;const i=Number(b.dataset.answer);if(wordKey(s.options[i])===wordKey(w))b.classList.add('correct');else if(i===value)b.classList.add('wrong');});
 if($('spelling')){$('spelling').disabled=true;$('spelling-form').querySelector('button').disabled=true;}
 $('feedback').innerHTML=`<div class="feedback ${correct?'':'wrong'}"><strong>${correct?'答對了':'再記一次'} · ${escape(w.english)} = ${escape(w.chinese)}</strong><p>${g.sound==='options'?`正確發音是選項 ${s.options.findIndex(o=>wordKey(o)===wordKey(w))+1}。選項詞彙：${s.options.map((o,i)=>`${i+1}. ${escape(o.english)}`).join(' / ')}`:`詞義與拼字依照你的課程題庫。${w.pos?' 詞性：'+escape(w.pos):''}${w.id?' · 原序號 '+w.id:''}`}</p><button class="speak" data-action="play-question" ${!audioSupported?'disabled':''}>♫ 聽正確發音</button></div>`;
 $('next-area').innerHTML=`<div class="next-row"><span>${s.quiz?'本次':'本關'}已答對 ${s.answers.filter(a=>a.correct).length} 題</span><button class="primary" data-action="next">${s.index+1===s.questions.length?(s.quiz?'查看小考結果':'查看本關結果'):'下一題'}</button></div>`;return correct;
}
function next(){if(!session||!session.answered||session.finished)return;stopAudio();if(session.index+1<session.questions.length){session.index++;renderQuestion();}else finish();}
function finish(){
 clearInterval(timer);session.finished=true;const s=session,correct=s.answers.filter(a=>a.correct).length,total=s.questions.length,percent=Math.round(correct/total*100),summary={gate:s.gate,correct,total,percent};s.summaries.push(summary);
 if(s.quiz){const wrong=s.answers.filter(a=>!a.correct);$('activity').innerHTML=`<div class="result quiz-result"><p class="eyebrow">${escape(s.quiz.label)} · 看中拼英</p><h2>${s.quiz.review?'錯字複習完成':'小考練習完成'}</h2><div class="result-score">${percent}<span> %</span></div><p>答對 ${correct} / ${total} 題 · 答錯 ${wrong.length} 題<br>練習用時 ${duration(Date.now()-s.started)}</p><div class="card-actions"><button class="primary" data-action="retry-quiz">重練本組 ${s.quiz.pool.length} 題</button>${wrong.length?`<button class="secondary" data-action="review-quiz">只練本次 ${wrong.length} 個錯字</button>`:''}<button class="secondary" data-view="quiz">選擇其他組</button></div>${wrong.length?`<div class="quiz-errors"><h3>本次錯字清單</h3><ul>${wrong.map(a=>`<li><p>${escape(a.word.chinese)} <span class="storage-note">· 原序號 ${escape(a.word.id||'未提供')}</span></p><strong>${escape(a.word.english)}</strong><p class="quiz-your-answer">你的答案：${escape(a.answer)}</p></li>`).join('')}</ul></div>`:'<p>本次全部答對，可以前往下一組，或再打亂順序練一次。</p>'}<p class="storage-note">這是練習答對率；實際小考評分依老師規定。</p></div>`;return;}
 $('activity').innerHTML=`<div class="result"><p class="eyebrow">第 ${s.gate} 關 · ${GATES[s.gate-1].name}</p><h2>本關練習完成</h2><div class="result-score">${percent}<span> %</span></div><p>答對 ${correct} / ${total} 題 · 本關用時 ${duration(Date.now()-s.started)}<br>這是練習答對率，並非官方檢定成績。</p>${s.continuous?`<div class="results-list">${s.summaries.map(r=>`<div><span>第 ${r.gate} 關 ${GATES[r.gate-1].name}</span><strong>${r.correct} / ${r.total}</strong></div>`).join('')}</div>`:''}<div class="card-actions">${s.continuous&&s.gate<6?'<button class="primary" data-action="next-gate">前往下一關</button>':'<button class="primary" data-view="home">返回六關練習</button>'}<button class="secondary" data-view="mistakes">查看錯題</button></div></div>`;
}
function nextGate(){if(!session||!session.finished||!session.continuous||session.gate>=6)return;const summaries=session.summaries,limit=session.limit,nextId=session.gate+1;start(nextId,true);session.limit=limit;session.questions=shuffle(bank).slice(0,limit==='all'?bank.length:Number(limit));session.summaries=summaries;renderQuestion();updateChrome();}
function speak(text,onEnd){
 if(!audioSupported){audioError('此瀏覽器不支援語音朗讀。');return;}
 const spoken=/^[A-Z0-9]{2,8}$/.test(text)?text.split('').join(' '):text;const u=new SpeechSynthesisUtterance(spoken);u.lang='en-US';u.rate=.9;const voices=speechSynthesis.getVoices();const voice=voices.find(v=>v.lang==='en-US')||voices.find(v=>v.lang.startsWith('en'));if(voice)u.voice=voice;
 u.onend=()=>{if(onEnd)onEnd();};u.onerror=e=>{if(!['canceled','interrupted'].includes(e.error))audioError('發音未能播放，請按播放按鈕重試，並確認裝置音量。');};speechSynthesis.speak(u);
}
function audioError(message){if($('audio-message'))$('audio-message').textContent=message;announce(message);}
function playQuestion(){if(!session)return;stopAudio();if($('audio-message'))$('audio-message').textContent='';speak(session.questions[session.index].english);}
function playOption(i){if(!session||!session.options[i])return;stopAudio();if($('audio-message'))$('audio-message').textContent='';speak(session.options[i].english);}
function playAll(){if(!session||session.options.length!==4)return;stopAudio();const generation=audioGeneration;let i=0;function play(){if(generation!==audioGeneration||!session||i>=4){document.querySelectorAll('.audio-option').forEach(e=>e.classList.remove('playing'));return;}document.querySelectorAll('.audio-option').forEach(e=>e.classList.remove('playing'));$('audio-option-'+i)?.classList.add('playing');speak(session.options[i].english,()=>{i++;play();});}play();}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;try{
 if(b.dataset.view){setView(b.dataset.view);return;}if(b.dataset.gate){start(Number(b.dataset.gate));return;}if(b.dataset.review){start(Number(b.dataset.review),false,true);return;}
 if(b.dataset.answer!==undefined){answer(Number(b.dataset.answer));return;}if(b.dataset.play!==undefined){playOption(Number(b.dataset.play));return;}
 const actions={import:importBank,continuous:()=>start(1,true),'start-quiz':()=>startQuiz(),'retry-quiz':()=>retryQuiz(),'review-quiz':()=>retryQuiz(true),next,nextGate,'next-gate':nextGate,'play-question':playQuestion,'play-all':playAll};actions[b.dataset.action]?.();
 }catch(error){announce(error.message);}});
document.addEventListener('keydown',e=>{if(!session||session.finished||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)||e.ctrlKey||e.altKey||e.metaKey)return;if(e.key==='8'){e.preventDefault();if(session.gate===5||session.gate===6)playAll();else playQuestion();}else if(/^[1-4]$/.test(e.key)&&session.gate!==1&&!session.answered){e.preventDefault();answer(Number(e.key)-1);}else if(e.key==='Enter'&&session.answered&&!e.target.closest('button')){e.preventDefault();next();}});
window.addEventListener('pagehide',stopAudio);
const context=document.modelContext;if(context?.registerTool){const lifecycle=new AbortController();const tools=[
 {name:'read_practice_state',title:'讀取 PVQC 練習狀態',description:'Read the current vocabulary count, mistakes and visible practice state. Does not reveal unanswered listening questions.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({view,words:bank.length,mistakes:mistakes.length,gate:session?.gate??null,question:session?session.index+1:null,answered:session?.answered??false,total:session?.questions.length??null,quiz:session?.quiz?{group:session.quiz.groupIndex+1,label:session.quiz.label,review:session.quiz.review}:null})},
 {name:'start_pvqc_gate',title:'開始 PVQC 關卡',description:'Start a single untimed practice gate with the imported course vocabulary.',inputSchema:{type:'object',properties:{gate:{type:'integer',minimum:1,maximum:6}},required:['gate'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>{if(!input||!Number.isInteger(input.gate)||input.gate<1||input.gate>6)throw new Error('gate must be 1–6');start(input.gate);return{gate:session.gate,total:session.questions.length};}},
 {name:'submit_pvqc_answer',title:'提交 PVQC 答案',description:'Submit the spelling answer or one-based choice to the current question. Updates the visible feedback and device-local mistakes.',inputSchema:{type:'object',properties:{spelling:{type:'string'},choice:{type:'integer',minimum:1,maximum:4}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:input=>{if(!session||session.answered||session.finished)throw new Error('No unanswered question');if(!input||typeof input!=='object')throw new Error('Invalid answer');if(session.gate===1){if(typeof input.spelling!=='string'||!input.spelling.trim())throw new Error('spelling is required');return{correct:answer(input.spelling)};}if(!Number.isInteger(input.choice)||input.choice<1||input.choice>4)throw new Error('choice must be 1–4');return{correct:answer(input.choice-1)};}}
 ];for(const tool of tools){try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});}
updateChrome();render();
})();

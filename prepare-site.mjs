// Fallback for the Sites helper becoming unavailable during this build.
// Credentials are accepted on hidden stdin and remain in process memory only.
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync,lstatSync} from 'node:fs';
import path from 'node:path';
console.log('Ready for publication input on stdin (input is hidden).');
if(process.stdin.isTTY)process.stdin.setRawMode(true);
const input=await new Promise((resolve,reject)=>{let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{text+=chunk;if(/[\r\n]/.test(text)){process.stdin.pause();resolve(text.split(/[\r\n]/)[0]);}});process.stdin.on('error',reject);});
const {credential,archivePath}=JSON.parse(input);
const manifest=JSON.parse(readFileSync('.openai/hosting.json','utf8'));
if(!manifest.project_id||manifest.static?.directory!=='dist')throw new Error('Invalid static Site manifest.');
const url=new URL(credential.remote_url);
if(url.protocol!=='https:'||url.username||url.password)throw new Error('Invalid source remote.');
if(credential.auth_mode!=='http_extra_header')throw new Error('Unsupported source credential mode.');
const env={...process.env,GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'http.extraHeader',GIT_CONFIG_VALUE_0:'Authorization: Bearer '+credential.token};
function git(args){const r=spawnSync('git',['-c','safe.directory='+path.resolve('.').replaceAll('\\','/'),...args],{encoding:'utf8',env,windowsHide:true,timeout:60000});if(r.status!==0)throw new Error('Source operation failed: '+args[0]+' '+String(r.stderr||r.error?.message||'').replaceAll(credential.token,'[redacted]'));return r.stdout.trim();}
if(!existsSync('.git'))git(['init','--initial-branch',credential.branch,'.']);
if(lstatSync('.git').isSymbolicLink())throw new Error('Unexpected repository link.');
if(path.resolve(git(['rev-parse','--show-toplevel']))!==path.resolve('.'))throw new Error('Wrong source checkout.');
let head='';try{head=git(['rev-parse','HEAD']);}catch{}
const advertised=git(['ls-remote','--heads',credential.remote_url,'refs/heads/'+credential.branch]);
if(advertised&&(!head||!advertised.startsWith(head+'\t')))throw new Error('Remote source changed; preserve and reconcile source before publication.');
git(['add','--all','.']);
git(['-c','user.name=Sites','-c','user.email=sites@users.noreply.openai.com','commit','-m','Build computing PVQC six-gate practice']);
const commit_sha=git(['rev-parse','HEAD']);
git(['push',credential.remote_url,'HEAD:refs/heads/'+credential.branch]);
const pushed=git(['ls-remote','--heads',credential.remote_url,'refs/heads/'+credential.branch]);
if(!pushed.startsWith(commit_sha+'\t'))throw new Error('Published source does not match local source.');
const archive=path.resolve(archivePath);
const packed=spawnSync('tar',['-czf',archive,'.openai/hosting.json','dist'],{encoding:'utf8',windowsHide:true});
if(packed.status!==0)throw new Error('Unable to package static assets.');
const listing=spawnSync('tar',['-tzf',archive],{encoding:'utf8',windowsHide:true});
if(listing.status!==0||!listing.stdout.includes('dist/index.html')||!listing.stdout.includes('.openai/hosting.json'))throw new Error('Archive validation failed.');
console.log(JSON.stringify({project_id:manifest.project_id,checkout_path:path.resolve('.'),commit_sha,archive}));

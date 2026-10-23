import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const child=spawn(require('electron'),['apps/desktop','--smoke-test'],{stdio:'inherit',env:{...process.env,ELECTRON_ENABLE_LOGGING:'1'}});
const timer=setTimeout(()=>{child.kill();process.exitCode=1;},45000);
child.on('exit',code=>{clearTimeout(timer);process.exitCode=code??1;});
child.on('error',()=>{clearTimeout(timer);process.exitCode=1;});

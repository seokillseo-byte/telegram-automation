import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('apps/desktop/dist',{recursive:true});
for (const [source,name] of [['main','main'],['preload','preload'],['worker','worker']]) {
 await build({entryPoints:[`apps/desktop/src/main/${source}.ts`],outfile:`apps/desktop/dist/${name}.cjs`,platform:'node',target:'node24',format:'cjs',bundle:true,external:['electron','telegram','telegram/*']});
}
await build({entryPoints:['apps/desktop/src/renderer/index.tsx'],outfile:'apps/desktop/dist/renderer.js',platform:'browser',target:'chrome140',bundle:true,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},minify:true});
await copyFile('apps/desktop/src/renderer/index.html','apps/desktop/dist/index.html');
await copyFile('apps/desktop/src/renderer/style.css','apps/desktop/dist/style.css');

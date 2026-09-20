const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const browser = await chromium.launch({headless:true});
 const page = await browser.newPage();
 const errors=[];
 page.on('pageerror', e => errors.push(e.message));
 const fragment=fs.readFileSync(path.join(__dirname,'still-mobile-concept.html'),'utf8');
 for(const width of [736,360,320]) {
  await page.setViewportSize({width,height:1050});
  for(const theme of ['light','dark']){
   await page.emulateMedia({colorScheme:theme});
   await page.setContent('<style>body{margin:0;}button,textarea{font-family:inherit}</style>'+fragment);
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Overflow '+width+' '+theme);
   await page.locator('[data-emotion="0"]').click();
   await page.getByRole('button',{name:'Capture what I’m feeling'}).click();
   await page.getByRole('button',{name:'Save moment'}).click();
   await page.getByRole('status').filter({hasText:'Write a thought'}).waitFor();
   await page.locator('#st-note').fill('I want to chase this move.');
   await page.getByRole('button',{name:'Save moment'}).click();
   await page.locator('[data-entry="0"]').click();
   await page.locator('#st-reflection').fill('Returning to the checklist helped.');
   await page.getByRole('button',{name:'Save reflection'}).click();
   await page.getByRole('status').filter({hasText:'Reflection saved'}).waitFor();
   await page.locator('[data-nav="toolkit"]').click();
   await page.locator('[data-edit="0"]').click();
   await page.locator('#st-reminder').fill('My own calm reminder.');
   await page.getByRole('button',{name:'Save & preview'}).click();
   await page.getByText('My own calm reminder.',{exact:true}).waitFor();
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Detail overflow '+width+' '+theme);
  }
 }
 await page.setViewportSize({width:420,height:980});
 await page.emulateMedia({colorScheme:'dark'});
 await page.setContent('<style>body{margin:0;background:#121513}</style>'+fragment);
 await page.screenshot({path:path.join(__dirname,'still-preview.png'),fullPage:true});
 await page.locator('[data-action="quick"]').click();
 await page.getByRole('button',{name:'Try recording'}).click();
 await page.waitForTimeout(1100);
 await page.getByRole('button',{name:'Stop demo'}).click();
 if(await page.locator('#st-clock').textContent()!=='00:01')throw Error('Timer failed');
 await page.getByRole('button',{name:'Save moment'}).click();
 await page.getByText('Prototype entry · 00:01').waitFor();
 await page.locator('[data-nav="toolkit"]').click();
 await page.locator('[data-edit="0"]').click();
 await page.locator('[data-format="text"]').uncheck();
 await page.getByRole('button',{name:'Save & preview'}).click();
 await page.getByRole('status').filter({hasText:'Choose at least one format.'}).waitFor();
 await page.locator('[data-format="audio"]').check();
 await page.getByRole('button',{name:'Save & preview'}).click();
 await page.getByRole('status').filter({hasText:'Choose your audio file.'}).waitFor();
 const wav=Buffer.alloc(1644);wav.write('RIFF',0);wav.writeUInt32LE(1636,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(1600,40);
 await page.locator('#st-audio-file').setInputFiles({name:'test-reminder.wav',mimeType:'audio/wav',buffer:wav});
 await page.getByText('test-reminder.wav',{exact:true}).waitFor();
 await page.locator('[data-format="image"]').check();
 await page.locator('#st-image-file').setInputFiles({name:'test-reminder.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
 await page.getByText('test-reminder.png',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Save & preview'}).click();
 if(await page.locator('.st-reminder').count()!==0)throw Error('Text hidden format failed');
 await page.locator('audio').waitFor();await page.locator('.st-image').waitFor();
 await page.waitForFunction(()=>document.querySelector('.st-image').naturalWidth===1);
 await page.getByRole('button',{name:'Personalize text, audio & image'}).click();
 await page.locator('[data-format="text"]').check();
 await page.getByRole('button',{name:'Save & preview'}).click();
 if(await page.locator('audio,.st-image,.st-reminder').count()!==3)throw Error('Combined card failed');
 for(const width of [320,736]){
  await page.setViewportSize({width,height:1000});
  await page.getByRole('button',{name:'Appearance settings'}).click();
  for(const appearance of ['Light','Dark']){
   await page.locator('#st-appearance').selectOption(appearance);
   for(const theme of ['Sage','Sand','Ocean','Lavender']){
    await page.locator('[data-theme="'+theme+'"]').click();
    if(await page.locator('[data-theme="'+theme+'"]').getAttribute('aria-pressed')!=='true')throw Error('Theme selection failed');
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Theme overflow');
   }
  }
 }
 await page.locator('#st-motion').uncheck();
 if(await page.locator('#still-concept').getAttribute('data-motion')!=='off')throw Error('Motion toggle failed');
 await page.locator('#st-motion').check();
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.getByRole('button',{name:'Back to my session'}).click();
 if(await page.locator('.st-emotion').first().evaluate(el=>getComputedStyle(el).transitionDuration)!=='0s')throw Error('Reduced motion failed');
 await page.getByRole('button',{name:'Appearance settings'}).click();
 await page.setViewportSize({width:420,height:1000});
 await page.screenshot({path:path.join(__dirname,'still-theme-preview.png'),fullPage:true});
 if(errors.length)throw Error(errors.join('; '));
 console.log('PASS: responsive original flows, media format validation, real image/audio attachment preview, combined card, four palettes in light/dark, motion toggle and system reduced motion.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

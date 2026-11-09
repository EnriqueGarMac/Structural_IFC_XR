import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('brand uses one coherent vector logo in header and favicon',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const logo=readFileSync(new URL('../public/imis-structural-xr-mark.svg',import.meta.url),'utf8');
  assert.match(html,/<img src="\.\/imis-structural-xr-mark\.svg"/);
  assert.match(html,/<link rel="icon" type="image\/svg\+xml" href="\.\/imis-structural-xr-mark\.svg"/);
  assert.doesNotMatch(html,/<div class="brand-logo">I<span>·<\/span><\/div>/);
  assert.match(logo,/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64"/);
  assert.match(logo,/stroke="#F8BB7D"/);
  assert.ok(logo.length<3000);
});

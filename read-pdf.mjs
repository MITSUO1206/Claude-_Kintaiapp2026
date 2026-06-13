import { resolve } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

const pdfPath = resolve('..', '資料', '画面設計書【最新】.pdf');
const fileUrl = 'file:///' + pdfPath.split('\\').join('/');

const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = 'file:///' + workerPath.split('\\').join('/');

const loadingTask = pdfjsLib.getDocument({ url: fileUrl });
const pdf = await loadingTask.promise;
console.log('Total pages:', pdf.numPages);

for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const content = await page.getTextContent();
  const pageText = content.items.map(item => ('str' in item ? item.str : '')).join(' ');
  console.log('\n=== PAGE ' + i + ' ===');
  console.log(pageText);
}

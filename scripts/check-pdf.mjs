import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFileSync } from 'node:fs';
import { stdout } from 'node:process';
const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const font=await pdf.embedFont(readFileSync('supabase/functions/_shared/plex-arabic.ttf'),{subset:false});const charset=new Set(font.getCharacterSet());for(const character of 'WISE 0123456789 تقرير')if(!charset.has(character.codePointAt(0)))throw new Error('Missing report glyph');pdf.addPage().drawText('تقرير إنتاج الكشك WISE',{font});const bytes=await pdf.save();if(bytes.length<500)throw new Error('Empty PDF');stdout.write(`Bilingual PDF generated: ${bytes.length} bytes\n`);

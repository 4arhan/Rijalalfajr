// Draws a story-sized card (1080 x 1920) and hands it to the phone's share sheet.
export interface CardData {
  name: string;
  streak: number;
  mosque: string;
  total?: number;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

export async function drawCard(d: CardData): Promise<Blob> {
  await document.fonts.ready;
  const W = 1080;
  const H = 1920;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  const font = (w: number, s: number) => `${w} ${s}px "Manrope Variable", system-ui, sans-serif`;

  const bg = x.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, '#15402f');
  bg.addColorStop(0.5, '#0b2319');
  bg.addColorStop(1, '#06130f');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);

  // Dawn on the horizon.
  const sun = x.createRadialGradient(W / 2, H * 0.78, 20, W / 2, H * 0.78, 760);
  sun.addColorStop(0, 'rgba(255, 214, 130, 0.9)');
  sun.addColorStop(0.3, 'rgba(240, 176, 80, 0.35)');
  sun.addColorStop(1, 'rgba(240, 176, 80, 0)');
  x.fillStyle = sun;
  x.fillRect(0, 0, W, H);
  x.fillStyle = '#06130f';
  x.fillRect(0, H * 0.78, W, H * 0.22);
  x.fillStyle = '#a8f0cf';
  x.fillRect(120, H * 0.78 - 5, W - 240, 10);

  x.textAlign = 'center';
  x.fillStyle = '#7beabc';
  x.font = font(700, 40);
  x.fillText('R I J A L   A L - F A J R', W / 2, 250);

  x.fillStyle = '#eef8f2';
  x.font = font(300, 460);
  x.fillText(String(d.streak), W / 2, 830);
  x.font = font(700, 64);
  x.fillText(d.streak === 1 ? 'dawn at the mosque' : 'dawns in a row', W / 2, 950);

  x.fillStyle = '#b4ccc1';
  x.font = font(600, 50);
  let y = 1090;
  for (const line of wrap(x, d.name, W - 200)) {
    x.fillText(line, W / 2, y);
    y += 66;
  }
  x.fillStyle = '#7beabc';
  x.font = font(600, 44);
  for (const line of wrap(x, d.mosque, W - 200)) {
    x.fillText(line, W / 2, y + 10);
    y += 58;
  }

  x.fillStyle = '#b4ccc1';
  x.font = font(600, 38);
  x.fillText('Pray Fajr at your mosque. Check in. Keep the streak.', W / 2, H - 190);
  x.fillStyle = '#eef8f2';
  x.font = font(700, 40);
  x.fillText(location.host, W / 2, H - 120);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the card'))), 'image/png'));
}

export async function shareCard(d: CardData) {
  const blob = await drawCard(d);
  const file = new File([blob], 'rijal-al-fajr.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: `${d.streak} dawns in a row at ${d.mosque}. #RijalAlFajr` });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

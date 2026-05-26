import Phaser from 'phaser';

const W = 660;
const H = 450; // +30 extra for timer bar

const RESET_INTERVAL = 180000; // 3 minutes

// Each trade: costResource is the key in res{}, baseCost is the starting price
const TRADES = [
  {
    id:           'food',
    labelRu:      'Еда',
    label:        'Food',
    costResource: 'plants',
    costLabel:    'Plants',
    gives:        { food: 1, water: 0 },
    baseCost:     2,
  },
  {
    id:           'water',
    labelRu:      'Вода',
    label:        'Water',
    costResource: 'ore',
    costLabel:    'Ore',
    gives:        { food: 0, water: 1 },
    baseCost:     2,
  },
];

function getCurrentCost(trade, tradeCounts) {
  return trade.baseCost + (tradeCounts[trade.id] || 0);
}

// Returns a label + color for the current price step
function getPriceLevel(cost, baseCost) {
  const step = cost - baseCost;
  if (step === 0) return { label: '● ВЫГОДНО',      color: '#6eff9a' };
  if (step === 1) return { label: '● НОРМА',         color: '#a8d460' };
  if (step === 2) return { label: '● УМЕРЕННО',      color: '#f5e682' };
  if (step === 3) return { label: '● ДОРОГО',        color: '#ff9500' };
  return               { label: '● ОЧЕНЬ ДОРОГО',   color: '#ff6b6b' };
}

export default class TradeScene extends Phaser.Scene {
  constructor() {
    super('TradeScene');
  }

  init(data) {
    this.res           = { ...data.resources };
    this.onClose       = data.onClose || (() => {});
    this.tradeCounts   = { ...(data.tradeCounts  || { food: 0, water: 0 }) };
    this.resetTimeLeft = data.resetTimeLeft != null ? data.resetTimeLeft : RESET_INTERVAL;
    this.selectedIdx   = 0;
    this.feedbackTtl   = 0;
  }

  create() {
    const sw = this.scale.width;
    const sh = this.scale.height;
    this.cx = sw / 2;
    this.cy = sh / 2;

    // dim overlay
    this.add.rectangle(this.cx, this.cy, sw, sh, 0x000000, 0.72);

    this.drawWindow();
    this.buildTimerBar();
    this.buildResourcePanel();
    this.buildTradePanel();
    this.buildBottomBar();

    this.upKey    = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.downKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.eKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.escKey   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.refreshAll();
    this.cameras.main.fadeIn(180, 0, 0, 0);
  }

  // ── Drawing ──────────────────────────────────────────────

  drawWindow() {
    const x = this.cx - W / 2;
    const y = this.cy - H / 2;
    const g = this.add.graphics();

    // Shadow
    g.fillStyle(0x000000, 0.5);
    g.fillRect(x + 8, y + 8, W, H);

    // Body
    g.fillStyle(0x070e1c, 1);
    g.fillRect(x, y, W, H);

    // Outer border
    g.lineStyle(4, 0x7a421d, 1);
    g.strokeRect(x, y, W, H);

    // Inner glow
    g.lineStyle(1, 0xc87428, 0.4);
    g.strokeRect(x + 5, y + 5, W - 10, H - 10);

    // Title bar
    g.fillStyle(0x120a04, 1);
    g.fillRect(x, y, W, 48);
    g.lineStyle(2, 0x7a421d, 1);
    g.lineBetween(x, y + 48, x + W, y + 48);

    // Timer bar background (below title)
    g.fillStyle(0x07111e, 1);
    g.fillRect(x, y + 48, W, 26);
    g.lineStyle(1, 0x1e3050, 1);
    g.lineBetween(x, y + 74, x + W, y + 74);

    // Vertical divider (content area)
    g.lineStyle(1, 0x1e3050, 1);
    g.lineBetween(x + 220, y + 74, x + 220, y + H - 52);

    // Bottom bar
    g.fillStyle(0x0a0610, 1);
    g.fillRect(x, y + H - 52, W, 52);
    g.lineStyle(1, 0x7a421d, 0.5);
    g.lineBetween(x, y + H - 52, x + W, y + H - 52);

    // Title text
    this.add.text(this.cx, y + 24, '⚙   РАКЕТНЫЙ ТЕРМИНАЛ   ⚙', {
      fontFamily: 'monospace',
      fontSize: '17px',
      color: '#f5e682',
    }).setOrigin(0.5);

    this.drawPixelRocket(x + 24, y + 14);
  }

  drawPixelRocket(ox, oy) {
    const g = this.add.graphics();
    const U = 3;
    const c = [
      [0,0,1,0,0],
      [0,1,1,1,0],
      [0,1,2,1,0],
      [1,1,1,1,1],
      [1,1,1,1,1],
      [0,1,3,1,0],
      [0,3,0,3,0],
    ];
    const palette = { 1: 0xd0d0d0, 2: 0x4db8ff, 3: 0xff9500 };
    c.forEach((row, ry) => {
      row.forEach((v, rx) => {
        if (!v) return;
        g.fillStyle(palette[v], 1);
        g.fillRect(ox + rx * U, oy + ry * U, U, U);
      });
    });
  }

  buildTimerBar() {
    const x = this.cx - W / 2;
    const y = this.cy - H / 2 + 48;

    // Fill rectangle (shrinks over time)
    this.timerFill = this.add.rectangle(x + 1, y + 1, W - 2, 24, 0x1a3a5a).setOrigin(0, 0);

    // Label centered
    this.timerLabel = this.add.text(this.cx, y + 13, '', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#4a7aaa',
    }).setOrigin(0.5, 0.5);
  }

  buildResourcePanel() {
    const x = this.cx - W / 2 + 14;
    const y = this.cy - H / 2 + 84; // +74 content start + 10 padding

    this.add.text(x, y, '[ РЕСУРСЫ ]', {
      fontFamily: 'monospace', fontSize: '12px', color: '#4a7aaa',
    });

    const style = { fontFamily: 'monospace', fontSize: '15px', color: '#c8dff5' };
    this.resLabels = {
      plants: this.add.text(x, y + 26,  '', style),
      ore:    this.add.text(x, y + 50,  '', style),
      food:   this.add.text(x, y + 88,  '', style),
      water:  this.add.text(x, y + 112, '', style),
    };

    // Separator between input and output resources
    const g = this.add.graphics();
    g.lineStyle(1, 0x1e3050, 1);
    g.lineBetween(x, y + 74, x + 192, y + 74);
  }

  buildTradePanel() {
    const px = this.cx - W / 2 + 230;
    const py = this.cy - H / 2 + 84;

    this.add.text(px, py, '[ ОБМЕНЫ ]', {
      fontFamily: 'monospace', fontSize: '12px', color: '#4a7aaa',
    });

    const rowH = 104;
    const pw   = W - 220 - 28; // right panel width

    this.tradeRows = TRADES.map((trade, i) => {
      const ry = py + 26 + i * rowH;

      const boxG  = this.add.graphics();

      // Main cost label  e.g. "2× Plants  →  1× Food"
      const costT = this.add.text(px + 22, ry + 7, '', {
        fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
      });

      // Price level badge (top-right of row)
      const levelT = this.add.text(px + pw - 8, ry + 7, '', {
        fontFamily: 'monospace', fontSize: '11px', color: '#6eff9a',
      }).setOrigin(1, 0);

      // Affordability hint
      const hintT = this.add.text(px + 22, ry + 32, '', {
        fontFamily: 'monospace', fontSize: '12px', color: '#4a6a8a',
      });

      // "Next price" preview
      const nextT = this.add.text(px + 22, ry + 54, '', {
        fontFamily: 'monospace', fontSize: '11px', color: '#3a5a7a',
      });

      // Trade count (top-right, under level badge)
      const countT = this.add.text(px + pw - 8, ry + 30, '', {
        fontFamily: 'monospace', fontSize: '11px', color: '#3a5a7a',
      }).setOrigin(1, 0);

      // Selection arrow
      const arrow = this.add.text(px + 5, ry + 13, '▶', {
        fontFamily: 'monospace', fontSize: '14px', color: '#6eff9a',
      }).setVisible(false);

      return { trade, boxG, costT, levelT, hintT, nextT, countT, arrow, ry, rx: px, pw };
    });
  }

  buildBottomBar() {
    const y = this.cy + H / 2 - 36;

    this.add.text(this.cx - W / 2 + 14, y,
      '↑↓ — выбор   |   E / Enter — обменять   |   Esc — закрыть', {
        fontFamily: 'monospace', fontSize: '12px', color: '#3a5a7a',
      }).setOrigin(0, 0.5);

    this.feedbackLabel = this.add.text(this.cx + W / 2 - 14, y, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#6eff9a',
    }).setOrigin(1, 0.5);
  }

  // ── Refresh ──────────────────────────────────────────────

  refreshTimerBar() {
    const progress  = Math.max(0, Math.min(1, this.resetTimeLeft / RESET_INTERVAL));
    const maxW      = W - 2;
    this.timerFill.setSize(maxW * progress, 24);

    // Colour shifts as timer runs down: blue → amber → red
    let fillColor;
    if (progress > 0.5)       fillColor = 0x1a3a5a;
    else if (progress > 0.25) fillColor = 0x3a3010;
    else                      fillColor = 0x3a1010;
    this.timerFill.setFillStyle(fillColor);

    const totalSec = Math.ceil(Math.max(0, this.resetTimeLeft) / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    this.timerLabel.setText(
      `Сброс цен через:  ${m}:${String(s).padStart(2, '0')}`
    );
  }

  refreshAll() {
    // ── Resources ──
    this.resLabels.plants.setText(`🌿 Plants  : ${this.res.plants}`);
    this.resLabels.ore.setText(`⛏  Ore     : ${this.res.ore}`);
    this.resLabels.food.setText(`🍖 Food    : ${this.res.food}`);
    this.resLabels.water.setText(`💧 Water   : ${this.res.water}`);

    // ── Trade rows ──
    this.tradeRows.forEach(({ trade, boxG, costT, levelT, hintT, nextT, countT, arrow, ry, rx, pw }, i) => {
      const selected   = i === this.selectedIdx;
      const cost       = getCurrentCost(trade, this.tradeCounts);
      const affordable = this.res[trade.costResource] >= cost;
      const count      = this.tradeCounts[trade.id] || 0;
      const level      = getPriceLevel(cost, trade.baseCost);

      // Box background + border
      boxG.clear();
      if (selected) {
        boxG.fillStyle(affordable ? 0x0a2218 : 0x220a0a, 1);
        boxG.fillRect(rx, ry, pw, 90);
        boxG.lineStyle(2, affordable ? 0x3aee8a : 0xee4444, 1);
        boxG.strokeRect(rx, ry, pw, 90);
      } else {
        boxG.lineStyle(1, 0x1a2a3a, 1);
        boxG.strokeRect(rx, ry, pw, 90);
      }

      const mainColor = selected
        ? (affordable ? '#ffffff' : '#ff9999')
        : (affordable ? '#7a9cbf' : '#3a5060');

      // "2× Plants  →  1× Food"
      costT.setText(`${cost}×  ${trade.costLabel}   →   1×  ${trade.label}`);
      costT.setColor(mainColor);

      // Price level badge
      levelT.setText(level.label);
      levelT.setColor(level.color);

      // Affordability
      hintT.setText(affordable ? '✓  ресурсов достаточно' : '✗  не хватает ресурсов');
      hintT.setColor(affordable ? '#2a8a4a' : '#7a3030');

      // Next price hint
      if (count === 0) {
        nextT.setText('↑  первая сделка — минимальная цена');
        nextT.setColor('#2a6a3a');
      } else {
        const nextCost = cost + 1; // after one more trade cost will be this
        nextT.setText(`↑  после этой сделки:  ${nextCost}×  ${trade.costLabel}`);
        nextT.setColor(nextCost - trade.baseCost >= 3 ? '#6a3010' : '#4a5a3a');
      }

      // Trade counter
      const countColor = count === 0 ? '#2a7a4a' : count <= 2 ? '#7a7a2a' : '#7a3030';
      countT.setText(`Сделок: ${count}`);
      countT.setColor(countColor);

      arrow.setVisible(selected);
      arrow.setColor(affordable ? '#6eff9a' : '#ff6b6b');
    });

    this.refreshTimerBar();
  }

  // ── Logic ────────────────────────────────────────────────

  canAfford(trade) {
    const cost = getCurrentCost(trade, this.tradeCounts);
    return this.res[trade.costResource] >= cost;
  }

  executeTrade() {
    const trade = TRADES[this.selectedIdx];
    if (!this.canAfford(trade)) {
      this.showFeedback('✗  Недостаточно ресурсов!', false);
      return;
    }

    const cost = getCurrentCost(trade, this.tradeCounts);
    this.res[trade.costResource] -= cost;
    this.res.food  += trade.gives.food;
    this.res.water += trade.gives.water;
    this.tradeCounts[trade.id] = (this.tradeCounts[trade.id] || 0) + 1;

    const nextCost = getCurrentCost(trade, this.tradeCounts);
    this.showFeedback(
      `✓  +1 ${trade.labelRu}   (след. цена: ${nextCost}× ${trade.costLabel})`,
      true
    );
    this.refreshAll();
  }

  showFeedback(msg, ok) {
    this.feedbackLabel.setText(msg);
    this.feedbackLabel.setColor(ok ? '#6eff9a' : '#ff6b6b');
    this.feedbackTtl = 2500;
  }

  closeMenu() {
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.time.delayedCall(180, () => {
      this.onClose({
        ...this.res,
        tradeCounts:   { ...this.tradeCounts },
        resetTimeLeft: this.resetTimeLeft,
      });
      this.scene.stop();
      this.scene.resume('GameScene');
    });
  }

  // ── Update ───────────────────────────────────────────────

  update(_t, delta) {
    // ── Reset countdown ──
    this.resetTimeLeft -= delta;
    if (this.resetTimeLeft <= 0) {
      this.resetTimeLeft = RESET_INTERVAL;
      this.tradeCounts   = { food: 0, water: 0 };
      this.showFeedback('✓  Цены сброшены! Снова всё по 2×', true);
      this.refreshAll();
    } else {
      this.refreshTimerBar();
    }

    // ── Keyboard ──
    if (Phaser.Input.Keyboard.JustDown(this.upKey)) {
      this.selectedIdx = (this.selectedIdx - 1 + TRADES.length) % TRADES.length;
      this.refreshAll();
    }
    if (Phaser.Input.Keyboard.JustDown(this.downKey)) {
      this.selectedIdx = (this.selectedIdx + 1) % TRADES.length;
      this.refreshAll();
    }
    if (Phaser.Input.Keyboard.JustDown(this.enterKey) || Phaser.Input.Keyboard.JustDown(this.eKey)) {
      this.executeTrade();
    }
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.closeMenu();
    }

    // ── Feedback timer ──
    if (this.feedbackTtl > 0) {
      this.feedbackTtl -= delta;
      if (this.feedbackTtl <= 0) this.feedbackLabel.setText('');
    }
  }
}

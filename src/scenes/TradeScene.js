import Phaser from 'phaser';

const W = 860;
const H = 510;

const RESET_INTERVAL = 180000; // 3 minutes

// ── Official terminal: safe standard prices ──────────────
const OFFICIAL_TRADES = [
  {
    id: 'food',
    labelRu: 'Еда',
    label: 'Food',
    costResource: 'plants',
    costLabel: 'Plants',
    gives: { food: 1 },
    baseCost: 2,
  },
  {
    id: 'water',
    labelRu: 'Вода',
    label: 'Water',
    costResource: 'ore',
    costLabel: 'Ore',
    gives: { water: 1 },
    baseCost: 2,
  },
];

// ── Black market: cheap individually, valuable in chains ──
const BM_TRADES = [
  {
    id: 'bm_plants_ore',
    labelRu: 'Руда',
    label: 'Ore',
    costResource: 'plants',
    costLabel: 'Plants',
    gives: { ore: 1 },
    baseCost: 1,
  },
  {
    id: 'bm_ore_food',
    labelRu: 'Еда',
    label: 'Food',
    costResource: 'ore',
    costLabel: 'Ore',
    gives: { food: 1 },
    baseCost: 1,
  },
  {
    id: 'bm_food_water',
    labelRu: 'Вода',
    label: 'Water',
    costResource: 'food',
    costLabel: 'Food',
    gives: { water: 1 },
    baseCost: 2,
  },
  {
    id: 'bm_water_plants',
    labelRu: 'Растения',
    label: 'Plants',
    costResource: 'water',
    costLabel: 'Water',
    gives: { plants: 1 },
    baseCost: 1,
  },
];

const EMPTY_COUNTS = () => ({
  food: 0, water: 0,
  bm_plants_ore: 0, bm_ore_food: 0, bm_food_water: 0, bm_water_plants: 0,
});

function getCurrentCost(trade, tradeCounts) {
  return trade.baseCost + (tradeCounts[trade.id] || 0);
}

function getPriceLevel(cost, baseCost) {
  const step = cost - baseCost;
  if (step === 0) return { label: '● ВЫГОДНО',     color: '#6eff9a' };
  if (step === 1) return { label: '● НОРМА',        color: '#a8d460' };
  if (step === 2) return { label: '● УМЕРЕННО',     color: '#f5e682' };
  if (step === 3) return { label: '● ДОРОГО',       color: '#ff9500' };
  return               { label: '● ОЧЕНЬ ДОРОГО',  color: '#ff6b6b' };
}

// ─────────────────────────────────────────────────────────

export default class TradeScene extends Phaser.Scene {
  constructor() { super('TradeScene'); }

  init(data) {
    this.res           = { ...data.resources };
    this.onClose       = data.onClose || (() => {});
    this.tradeCounts   = { ...EMPTY_COUNTS(), ...(data.tradeCounts || {}) };
    this.resetTimeLeft = data.resetTimeLeft != null ? data.resetTimeLeft : RESET_INTERVAL;
    this.activePanel   = 'official'; // 'official' | 'bm'
    this.officialIdx   = 0;
    this.bmIdx         = 0;
    this.feedbackTtl   = 0;
  }

  create() {
    const sw = this.scale.width;
    const sh = this.scale.height;
    this.cx  = sw / 2;
    this.cy  = sh / 2;

    this.add.rectangle(this.cx, this.cy, sw, sh, 0x000000, 0.78);

    this.drawWindow();
    this.buildTimerBar();
    this.buildResourcePanel();
    this.buildOfficialPanel();
    this.buildBmPanel();
    this.buildBottomBar();

    this.upKey    = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.downKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.leftKey  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.rightKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.eKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.escKey   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.refreshAll();
    this.cameras.main.fadeIn(180, 0, 0, 0);
  }

  // ══════════════════════════════════════════════════
  //  DRAWING
  // ══════════════════════════════════════════════════

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

    // Timer bar bg
    g.fillStyle(0x07111e, 1);
    g.fillRect(x, y + 48, W, 26);
    g.lineStyle(1, 0x1e3050, 1);
    g.lineBetween(x, y + 74, x + W, y + 74);

    // Content dividers: resources | official | black market
    const D1 = 186;
    const D2 = 510;
    g.lineStyle(1, 0x1e3050, 1);
    g.lineBetween(x + D1, y + 74,      x + D1, y + H - 52);
    g.lineBetween(x + D2, y + 74,      x + D2, y + H - 52);

    // Bottom bar
    g.fillStyle(0x0a0610, 1);
    g.fillRect(x, y + H - 52, W, 52);
    g.lineStyle(1, 0x7a421d, 0.5);
    g.lineBetween(x, y + H - 52, x + W, y + H - 52);

    // Black market tinted background
    g.fillStyle(0x1a0805, 0.45);
    g.fillRect(x + D2 + 1, y + 75, W - D2 - 2, H - 75 - 52);

    // Title
    this.add.text(this.cx, y + 24, '⚙   РАКЕТНЫЙ ТЕРМИНАЛ   ⚙', {
      fontFamily: 'monospace', fontSize: '17px', color: '#f5e682',
    }).setOrigin(0.5);

    this.drawPixelRocket(x + 24, y + 14);

    // Panel headers
    const offMidX = x + D1 + (D2 - D1) / 2;
    const bmMidX  = x + D2 + (W - D2) / 2;
    const hY      = y + 80;

    this.officialHeader = this.add.text(offMidX, hY, '[ ОФИЦИАЛЬНЫЙ ]', {
      fontFamily: 'monospace', fontSize: '11px', color: '#4a7aaa',
    }).setOrigin(0.5, 0);

    this.bmHeader = this.add.text(bmMidX, hY, '[ ⚠  ЧЁРНЫЙ РЫНОК ]', {
      fontFamily: 'monospace', fontSize: '11px', color: '#aa4a4a',
    }).setOrigin(0.5, 0);

    // Animated borders (drawn fresh in refreshPanelBorders)
    this.officialBorderG = this.add.graphics();
    this.bmBorderG       = this.add.graphics();
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
    const pal = { 1: 0xd0d0d0, 2: 0x4db8ff, 3: 0xff9500 };
    c.forEach((row, ry) => row.forEach((v, rx) => {
      if (!v) return;
      g.fillStyle(pal[v], 1);
      g.fillRect(ox + rx * U, oy + ry * U, U, U);
    }));
  }

  buildTimerBar() {
    const x = this.cx - W / 2;
    const y = this.cy - H / 2 + 48;
    this.timerFill  = this.add.rectangle(x + 1, y + 1, W - 2, 24, 0x1a3a5a).setOrigin(0, 0);
    this.timerLabel = this.add.text(this.cx, y + 13, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#4a7aaa',
    }).setOrigin(0.5, 0.5);
  }

  buildResourcePanel() {
    const x = this.cx - W / 2 + 12;
    const y = this.cy - H / 2 + 82;

    this.add.text(x, y, '[ РЕСУРСЫ ]', {
      fontFamily: 'monospace', fontSize: '11px', color: '#4a7aaa',
    });

    const st = { fontFamily: 'monospace', fontSize: '14px', color: '#c8dff5' };
    this.resLabels = {
      plants: this.add.text(x, y + 22,  '', st),
      ore:    this.add.text(x, y + 44,  '', st),
      food:   this.add.text(x, y + 80,  '', st),
      water:  this.add.text(x, y + 102, '', st),
    };

    const g = this.add.graphics();
    g.lineStyle(1, 0x1e3050, 1);
    g.lineBetween(x, y + 67, x + 166, y + 67);

    // Tip
    this.add.text(x, y + 140, '💡 СОВЕТ:', {
      fontFamily: 'monospace', fontSize: '10px', color: '#7a7a2a',
    });
    this.add.text(x, y + 155, 'Цепочки\nсделок через\nрынок могут\nбыть выгоднее!', {
      fontFamily: 'monospace', fontSize: '10px', color: '#5a5a2a', lineSpacing: 2,
    });

    // Example chain hint
    this.add.text(x, y + 255, 'Пример:', {
      fontFamily: 'monospace', fontSize: '10px', color: '#5a3a1a',
    });
    this.add.text(x, y + 270, 'Plants→Ore\n+ Ore→Food\n= дешевле чем\nPlants→Food', {
      fontFamily: 'monospace', fontSize: '10px', color: '#7a4a1a', lineSpacing: 2,
    });
  }

  // ── Official panel (2 trades, tall rows) ─────────────────

  buildOfficialPanel() {
    const x0  = this.cx - W / 2 + 196;
    const y0  = this.cy - H / 2 + 98;
    const pw  = 310;
    const rH  = 128;

    this.officialRows = OFFICIAL_TRADES.map((trade, i) => {
      const ry   = y0 + i * rH;
      const boxG = this.add.graphics();

      const costT  = this.add.text(x0 + 22, ry + 8, '', {
        fontFamily: 'monospace', fontSize: '15px', color: '#ffffff',
      });
      const levelT = this.add.text(x0 + pw - 6, ry + 8, '', {
        fontFamily: 'monospace', fontSize: '10px', color: '#6eff9a',
      }).setOrigin(1, 0);
      const hintT  = this.add.text(x0 + 22, ry + 34, '', {
        fontFamily: 'monospace', fontSize: '11px', color: '#4a6a8a',
      });
      const nextT  = this.add.text(x0 + 22, ry + 55, '', {
        fontFamily: 'monospace', fontSize: '10px', color: '#3a5a7a',
      });
      const countT = this.add.text(x0 + pw - 6, ry + 30, '', {
        fontFamily: 'monospace', fontSize: '10px', color: '#3a5a7a',
      }).setOrigin(1, 0);
      const arrow  = this.add.text(x0 + 6, ry + 13, '▶', {
        fontFamily: 'monospace', fontSize: '13px', color: '#6eff9a',
      }).setVisible(false);

      return { trade, boxG, costT, levelT, hintT, nextT, countT, arrow, ry, rx: x0, pw, rH: 118 };
    });
  }

  // ── Black market panel (4 trades, compact rows) ──────────

  buildBmPanel() {
    const x0  = this.cx - W / 2 + 520;
    const y0  = this.cy - H / 2 + 98;
    const pw  = 326;
    const rH  = 82;

    this.bmRows = BM_TRADES.map((trade, i) => {
      const ry   = y0 + i * rH;
      const boxG = this.add.graphics();

      const costT  = this.add.text(x0 + 18, ry + 7, '', {
        fontFamily: 'monospace', fontSize: '13px', color: '#ffccaa',
      });
      const levelT = this.add.text(x0 + pw - 6, ry + 7, '', {
        fontFamily: 'monospace', fontSize: '10px', color: '#ff9a6a',
      }).setOrigin(1, 0);
      const hintT  = this.add.text(x0 + 18, ry + 30, '', {
        fontFamily: 'monospace', fontSize: '10px', color: '#7a4a3a',
      });
      const countT = this.add.text(x0 + pw - 6, ry + 30, '', {
        fontFamily: 'monospace', fontSize: '10px', color: '#5a3a2a',
      }).setOrigin(1, 0);
      const arrow  = this.add.text(x0 + 4, ry + 9, '▶', {
        fontFamily: 'monospace', fontSize: '12px', color: '#ff9a6a',
      }).setVisible(false);

      return { trade, boxG, costT, levelT, hintT, countT, arrow, ry, rx: x0, pw, rH: 72 };
    });
  }

  buildBottomBar() {
    const y = this.cy + H / 2 - 36;
    this.add.text(this.cx - W / 2 + 12, y,
      '← → — панель   ↑ ↓ — выбор   E / Enter — обменять   Esc — закрыть', {
        fontFamily: 'monospace', fontSize: '11px', color: '#3a5a7a',
      }).setOrigin(0, 0.5);

    this.feedbackLabel = this.add.text(this.cx + W / 2 - 12, y, '', {
      fontFamily: 'monospace', fontSize: '12px', color: '#6eff9a',
    }).setOrigin(1, 0.5);
  }

  // ══════════════════════════════════════════════════
  //  REFRESH
  // ══════════════════════════════════════════════════

  refreshTimerBar() {
    const progress = Math.max(0, Math.min(1, this.resetTimeLeft / RESET_INTERVAL));
    this.timerFill.setSize((W - 2) * progress, 24);
    let col;
    if (progress > 0.5)       col = 0x1a3a5a;
    else if (progress > 0.25) col = 0x3a3010;
    else                      col = 0x3a1010;
    this.timerFill.setFillStyle(col);
    const totalSec = Math.ceil(Math.max(0, this.resetTimeLeft) / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    this.timerLabel.setText(`Сброс цен через:  ${m}:${String(s).padStart(2, '0')}`);
  }

  refreshPanelBorders() {
    const x  = this.cx - W / 2;
    const y  = this.cy - H / 2;
    const D1 = 186;
    const D2 = 510;
    const cH = H - 74 - 52;

    this.officialBorderG.clear();
    this.bmBorderG.clear();

    if (this.activePanel === 'official') {
      this.officialBorderG.lineStyle(2, 0x3a8aff, 0.75);
      this.officialBorderG.strokeRect(x + D1 + 2, y + 75, D2 - D1 - 4, cH - 2);
      this.officialHeader.setColor('#6aafff');
      this.bmHeader.setColor('#aa4a4a');
    } else {
      this.bmBorderG.lineStyle(2, 0xff5a3a, 0.75);
      this.bmBorderG.strokeRect(x + D2 + 2, y + 75, W - D2 - 4, cH - 2);
      this.officialHeader.setColor('#4a7aaa');
      this.bmHeader.setColor('#ff7a5a');
    }
  }

  refreshAll() {
    // Resources
    this.resLabels.plants.setText(`🌿 ${this.res.plants}  Plants`);
    this.resLabels.ore.setText(`⛏  ${this.res.ore}  Ore`);
    this.resLabels.food.setText(`🍖 ${this.res.food}  Food`);
    this.resLabels.water.setText(`💧 ${this.res.water}  Water`);

    // Official rows
    this.officialRows.forEach(({ trade, boxG, costT, levelT, hintT, nextT, countT, arrow, ry, rx, pw, rH }, i) => {
      const sel    = this.activePanel === 'official' && i === this.officialIdx;
      const cost   = getCurrentCost(trade, this.tradeCounts);
      const can    = this.res[trade.costResource] >= cost;
      const count  = this.tradeCounts[trade.id] || 0;
      const level  = getPriceLevel(cost, trade.baseCost);

      boxG.clear();
      if (sel) {
        boxG.fillStyle(can ? 0x0a1e30 : 0x220a0a, 1);
        boxG.fillRect(rx, ry, pw, rH);
        boxG.lineStyle(2, can ? 0x3a8aff : 0xee4444, 1);
        boxG.strokeRect(rx, ry, pw, rH);
      } else {
        boxG.lineStyle(1, 0x1a2a3a, 1);
        boxG.strokeRect(rx, ry, pw, rH);
      }

      const mc = sel ? (can ? '#ffffff' : '#ff9999') : (can ? '#6a9cbf' : '#3a5060');
      costT.setText(`${cost}×  ${trade.costLabel}   →   1×  ${trade.label}`);
      costT.setColor(mc);
      levelT.setText(level.label);
      levelT.setColor(level.color);
      hintT.setText(can ? '✓  ресурсов достаточно' : '✗  не хватает ресурсов');
      hintT.setColor(can ? '#2a6a4a' : '#7a3030');
      const nextCost = cost + 1;
      nextT.setText(count === 0
        ? '↑  первая сделка — базовая цена'
        : `↑  следующая:  ${nextCost}×  ${trade.costLabel}`);
      nextT.setColor(nextCost - trade.baseCost >= 3 ? '#6a3010' : '#3a5a4a');
      countT.setText(`Сделок: ${count}`);
      countT.setColor(count === 0 ? '#2a7a4a' : count <= 2 ? '#7a7a2a' : '#7a3030');
      arrow.setVisible(sel);
      arrow.setColor(can ? '#6eff9a' : '#ff6b6b');
    });

    // Black market rows
    this.bmRows.forEach(({ trade, boxG, costT, levelT, hintT, countT, arrow, ry, rx, pw, rH }, i) => {
      const sel   = this.activePanel === 'bm' && i === this.bmIdx;
      const cost  = getCurrentCost(trade, this.tradeCounts);
      const can   = this.res[trade.costResource] >= cost;
      const count = this.tradeCounts[trade.id] || 0;
      const level = getPriceLevel(cost, trade.baseCost);

      boxG.clear();
      if (sel) {
        boxG.fillStyle(can ? 0x1e0a08 : 0x1a0808, 1);
        boxG.fillRect(rx, ry, pw, rH);
        boxG.lineStyle(2, can ? 0xff6a3a : 0xee2222, 1);
        boxG.strokeRect(rx, ry, pw, rH);
      } else {
        boxG.lineStyle(1, 0x2a1a1a, 1);
        boxG.strokeRect(rx, ry, pw, rH);
      }

      const mc = sel ? (can ? '#ffccaa' : '#ff9999') : (can ? '#9a6a5a' : '#4a2a2a');
      costT.setText(`${cost}×  ${trade.costLabel}   →   1×  ${trade.label}`);
      costT.setColor(mc);
      levelT.setText(level.label);
      levelT.setColor(level.color);
      hintT.setText(can ? '✓  можно обменять' : '✗  не хватает');
      hintT.setColor(can ? '#4a6a3a' : '#6a2a2a');
      countT.setText(`×${count}`);
      countT.setColor(count === 0 ? '#3a6a3a' : count <= 2 ? '#6a5a2a' : '#7a2a2a');
      arrow.setVisible(sel);
      arrow.setColor(can ? '#ff9a6a' : '#ff3a3a');
    });

    this.refreshPanelBorders();
    this.refreshTimerBar();
  }

  // ══════════════════════════════════════════════════
  //  LOGIC
  // ══════════════════════════════════════════════════

  executeTrade() {
    const isOff = this.activePanel === 'official';
    const trade = isOff
      ? OFFICIAL_TRADES[this.officialIdx]
      : BM_TRADES[this.bmIdx];

    const cost = getCurrentCost(trade, this.tradeCounts);
    if (this.res[trade.costResource] < cost) {
      this.showFeedback('✗  Недостаточно ресурсов!', false);
      return;
    }

    this.res[trade.costResource] -= cost;
    for (const [res, amt] of Object.entries(trade.gives)) {
      this.res[res] = (this.res[res] || 0) + amt;
    }
    this.tradeCounts[trade.id] = (this.tradeCounts[trade.id] || 0) + 1;

    const nextCost = getCurrentCost(trade, this.tradeCounts);
    this.showFeedback(
      `✓  +1 ${trade.labelRu}   (след.: ${nextCost}× ${trade.costLabel})`,
      true,
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

  // ══════════════════════════════════════════════════
  //  UPDATE
  // ══════════════════════════════════════════════════

  update(_t, delta) {
    // Timer countdown + reset
    this.resetTimeLeft -= delta;
    if (this.resetTimeLeft <= 0) {
      this.resetTimeLeft = RESET_INTERVAL;
      this.tradeCounts   = EMPTY_COUNTS();
      this.showFeedback('✓  Цены сброшены!', true);
      this.refreshAll();
    } else {
      this.refreshTimerBar();
    }

    // Panel switch
    if (Phaser.Input.Keyboard.JustDown(this.leftKey)) {
      this.activePanel = 'official';
      this.refreshAll();
    }
    if (Phaser.Input.Keyboard.JustDown(this.rightKey)) {
      this.activePanel = 'bm';
      this.refreshAll();
    }

    // Row selection
    if (Phaser.Input.Keyboard.JustDown(this.upKey)) {
      if (this.activePanel === 'official') {
        this.officialIdx = (this.officialIdx - 1 + OFFICIAL_TRADES.length) % OFFICIAL_TRADES.length;
      } else {
        this.bmIdx = (this.bmIdx - 1 + BM_TRADES.length) % BM_TRADES.length;
      }
      this.refreshAll();
    }
    if (Phaser.Input.Keyboard.JustDown(this.downKey)) {
      if (this.activePanel === 'official') {
        this.officialIdx = (this.officialIdx + 1) % OFFICIAL_TRADES.length;
      } else {
        this.bmIdx = (this.bmIdx + 1) % BM_TRADES.length;
      }
      this.refreshAll();
    }

    // Execute
    if (Phaser.Input.Keyboard.JustDown(this.enterKey) || Phaser.Input.Keyboard.JustDown(this.eKey)) {
      this.executeTrade();
    }
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.closeMenu();
    }

    // Feedback fade
    if (this.feedbackTtl > 0) {
      this.feedbackTtl -= delta;
      if (this.feedbackTtl <= 0) this.feedbackLabel.setText('');
    }
  }
}

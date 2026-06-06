import Phaser from 'phaser';
import mapTmx from '../../tiled/my_map.tmx?raw';

const SURFACE_START_ROW = 19;
const PLAYER_SPAWN = { x: 240, y: 240 };
const PLAYER_SPEED = 170;
const JUMP_SPEED = 380;
const LADDER_SPEED = 120;
const LADDER_CENTER_X = 40;
const SHAFT_OPENING = {
  startX: 1,
  endX: 3,
  startY: 18,
  endY: 35
};
const PLANT_PATCH = {
  plants: [
    { startX: 26, endX: 27 },
    { startX: 28, endX: 29 },
    { startX: 30, endX: 31 },
    { startX: 32, endX: 33 },
    { startX: 34, endX: 35 },
    { startX: 36, endX: 37 },
    { startX: 38, endX: 39 },
    { startX: 40, endX: 41 }
  ],
  startY: 15,
  endY: 18,
  collectDistance: 28,
  respawnDelayMs: 30000
};

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  preload() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.collectKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.eatKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.tradeKey   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    this.load.image('player', '/assets/sprites/player.png');
    this.load.image('house', '/assets/objects/house.png');
    this.load.image('rocket', '/assets/objects/rocket.png');
    this.load.image('world-tileset', '/assets/tilesets/world_tileset.png');
  }

  create() {
    this.cameras.main.setBackgroundColor('#6db8ff');
    this.plantsCounterElement  = document.getElementById('plants-counter');
    this.oreCounterElement     = document.getElementById('ore-counter');
    this.foodCounterElement    = document.getElementById('food-counter');
    this.waterCounterElement   = document.getElementById('water-counter');
    this.satietySegsElement    = document.getElementById('satiety-segs');
    this.satietyCounterElement = document.getElementById('satiety-counter');

    this.collectedOre   = 0;
    this.collectedFood  = 0;
    this.collectedWater = 0;

    this.satiety        = 20;    // starts full
    this.satietyMax     = 20;
    this.satietyTimer   = 0;     // ms accumulator for 1-minute drain

    this.tradeCounts    = { food: 0, water: 0, bm_plants_ore: 0, bm_ore_food: 0, bm_food_water: 0, bm_water_plants: 0 };
    this.tradeResetTimer = 180000; // 3 minutes

    this.mapData = this.parseTmx(mapTmx);
    this.createMap();
    this.createSetPieces();
    this.defineLadderArea();
    this.createPlayer();
    this.createPlants();
    this.createUi();
    this.createHarvestGauge();
    this.setupCamera();
    this.updateSatietyBar();
  }

  update(time, delta) {
    this.handlePlayerMovement();
    this.handleSatietyDrain(delta);
    this.handleTradeReset(delta);

    if (this.isUnderground()) {
      this.handleMining(delta);
      this.housePrompt.setVisible(false);
    } else {
      // Cancel wheel if player left the mine mid-spin
      if (this.harvestState === 'spinning' && this.harvestMode === 'ore') this.cancelMining();
      this.minePrompt.setVisible(false);
      if (!this.handleRocketInteraction()) {
        if (!this.handleHouseInteraction()) {
          this.handlePlantCollection(delta);
        }
      } else {
        this.housePrompt.setVisible(false);
      }
    }

    this.updateInteractionText();
  }

  isUnderground() {
    return this.player.y > this.map.tileToWorldY(SURFACE_START_ROW) + 80;
  }

  parseTmx(tmxText) {
    const xml = new DOMParser().parseFromString(tmxText, 'application/xml');
    const mapNode = xml.querySelector('map');
    const width = Number(mapNode.getAttribute('width'));
    const height = Number(mapNode.getAttribute('height'));
    const tileWidth = Number(mapNode.getAttribute('tilewidth'));
    const tileHeight = Number(mapNode.getAttribute('tileheight'));

    const layers = [...xml.querySelectorAll('layer')].map((layerNode) => {
      const name = layerNode.getAttribute('name');
      const csv = layerNode.querySelector('data')?.textContent ?? '';
      const values = csv
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => !Number.isNaN(value))
        .map((value) => (value === 0 ? -1 : value));

      const rows = [];
      for (let y = 0; y < height; y += 1) {
        rows.push(values.slice(y * width, (y + 1) * width));
      }

      return { name, rows };
    });

    const objects = [...xml.querySelectorAll('objectgroup[name="house_and_rocket"] object')].map((objectNode) => ({
      x: Number(objectNode.getAttribute('x') ?? 0),
      y: Number(objectNode.getAttribute('y') ?? 0),
      width: Number(objectNode.getAttribute('width') ?? 0),
      height: Number(objectNode.getAttribute('height') ?? 0)
    }));

    return { width, height, tileWidth, tileHeight, layers, objects };
  }

  createMap() {
    const { width, height, tileWidth, tileHeight, layers } = this.mapData;

    this.map = this.make.tilemap({
      width,
      height,
      tileWidth,
      tileHeight
    });

    const tileset = this.map.addTilesetImage('zp', 'world-tileset', tileWidth, tileHeight, 0, 0, 1);
    this.collisionLayers = [];

    layers.forEach((layerData, index) => {
      const layer = this.map.createBlankLayer(layerData.name, tileset, 0, 0);
      layer.putTilesAt(layerData.rows, 0, 0);
      layer.setDepth(index);

      if (layerData.name === 'grow') {
        this.growLayer = layer;
      }

      if (layerData.name === 'backgrounds') {
        // Only the surface row provides collision — underground is handled by mine layers only
        layer.forEachTile((tile) => {
          if (tile.index > 0 && tile.y === SURFACE_START_ROW) {
            tile.setCollision(true, true, true, true);
          }
        });

        // Clear shaft entrance at surface level so player can descend
        for (let x = SHAFT_OPENING.startX; x <= SHAFT_OPENING.endX; x += 1) {
          const tile = layer.getTileAt(x, SURFACE_START_ROW);
          if (tile) tile.setCollision(false, false, false, false);
        }

        this.collisionLayers.push(layer);
      }

      if (['mine', 'mine 2', 'mine 3', 'Tile Layer 3', 'Tile Layer 4'].includes(layerData.name)) {
        layer.setCollisionByExclusion([-1, 0]);
        this.clearShaftCollision(layer);
        this.collisionLayers.push(layer);
      }
    });

    this.physics.world.setBounds(0, 0, width * tileWidth, height * tileHeight);
  }

  clearShaftCollision(layer) {
    // Clear the shaft passage (x=1–3, rows 18–35)
    for (let y = SHAFT_OPENING.startY; y <= SHAFT_OPENING.endY; y += 1) {
      for (let x = SHAFT_OPENING.startX; x <= SHAFT_OPENING.endX; x += 1) {
        const tile = layer.getTileAt(x, y);
        if (tile) {
          tile.setCollision(false, false, false, false);
        }
      }
    }

    // Clear the doorway from shaft into the room (x=4–7, bottom 3 rows of shaft)
    // Player is 28px tall — at floor level his body spans ~3 tile rows upward
    for (let y = SHAFT_OPENING.endY - 2; y <= SHAFT_OPENING.endY; y += 1) {
      for (let x = SHAFT_OPENING.endX + 1; x <= SHAFT_OPENING.endX + 4; x += 1) {
        const tile = layer.getTileAt(x, y);
        if (tile) {
          tile.setCollision(false, false, false, false);
        }
      }
    }
  }

  createSetPieces() {
    const sortedObjects = [...this.mapData.objects].sort((a, b) => a.x - b.x);
    const houseObject = sortedObjects[0] ?? { x: 80, y: 420, width: 220, height: 220 };
    const rocketObject = sortedObjects[1] ?? { x: 740, y: 400, width: 180, height: 220 };

    this.add
      .image(houseObject.x, houseObject.y, 'house')
      .setOrigin(0, 1)
      .setDisplaySize(houseObject.width, houseObject.height)
      .setDepth(20);

    this.add
      .image(rocketObject.x, rocketObject.y, 'rocket')
      .setOrigin(0, 1)
      .setDisplaySize(rocketObject.width, rocketObject.height)
      .setDepth(20);

    this.houseZone = this.add.zone(houseObject.x + 110, houseObject.y - 70, 220, 180);
    this.rocketZone = this.add.zone(rocketObject.x + 90, rocketObject.y - 120, 180, 240);

    this.physics.add.existing(this.houseZone, true);
    this.physics.add.existing(this.rocketZone, true);
  }

  createPlayer() {
    this.player = this.physics.add.sprite(PLAYER_SPAWN.x, PLAYER_SPAWN.y, 'player');
    this.player.setDepth(30);
    this.player.setCollideWorldBounds(true);
    this.player.isClimbing = false;

    const body = this.player.body;
    body.setSize(18, 28);
    body.setOffset(7, 4);

    this.collisionLayers.forEach((layer) => {
      this.physics.add.collider(this.player, layer);
    });
  }

  createPlants() {
    this.collectedPlants = 0;
    this.plants = PLANT_PATCH.plants.map((plantArea) => {
      const x = this.map.tileToWorldX(plantArea.startX) + ((plantArea.endX - plantArea.startX + 1) * this.map.tileWidth) / 2;
      const y = this.map.tileToWorldY(PLANT_PATCH.endY + 1);
      const tiles = [];

      for (let tileY = PLANT_PATCH.startY; tileY <= PLANT_PATCH.endY; tileY += 1) {
        const row = [];

        for (let tileX = plantArea.startX; tileX <= plantArea.endX; tileX += 1) {
          row.push(this.growLayer.getTileAt(tileX, tileY)?.index ?? -1);
        }

        tiles.push(row);
      }

      return { ...plantArea, x, y, tiles, collected: false, respawnEvent: null };
    });
  }

  defineLadderArea() {
    this.ladderArea = new Phaser.Geom.Rectangle(
      this.map.tileToWorldX(1),
      this.map.tileToWorldY(18),
      this.map.tileWidth * 3,
      this.map.tileHeight * 21
    );

    this.ladderEntryArea = new Phaser.Geom.Rectangle(
      this.map.tileToWorldX(1),
      this.map.tileToWorldY(18),
      this.map.tileWidth * 3,
      this.map.tileHeight * 2
    );
  }

  createUi() {
    this.hintText = this.add.text(24, 20, '← → ходить  |  Space прыгать  |  E собрать', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#00000099',
      padding: { x: 10, y: 6 }
    });
    this.hintText.setScrollFactor(0);
    this.hintText.setDepth(5001);

    this.plantPrompt = this.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffffff',
      backgroundColor: '#000000cc',
      padding: { x: 10, y: 6 }
    });
    this.plantPrompt.setOrigin(0.5, 1);
    this.plantPrompt.setDepth(1000);
    this.plantPrompt.setVisible(false);

    // Mine prompt (shown when underground and idle)
    this.minePrompt = this.add.text(0, 0, 'Удержи E для добычи', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffd97d',
      backgroundColor: '#000000cc',
      padding: { x: 10, y: 6 }
    });
    this.minePrompt.setOrigin(0.5, 1);
    this.minePrompt.setDepth(1000);
    this.minePrompt.setVisible(false);

    // Trade prompt (shown near rocket)
    this.tradePrompt = this.add.text(0, 0, 'T — открыть терминал', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#f5e682',
      backgroundColor: '#000000cc',
      padding: { x: 10, y: 6 }
    });
    this.tradePrompt.setOrigin(0.5, 1);
    this.tradePrompt.setDepth(1000);
    this.tradePrompt.setVisible(false);

    // House prompt (shown near house)
    this.housePrompt = this.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#a0e8b0',
      backgroundColor: '#000000cc',
      padding: { x: 10, y: 6 }
    });
    this.housePrompt.setOrigin(0.5, 1);
    this.housePrompt.setDepth(1000);
    this.housePrompt.setVisible(false);
  }

  setupCamera() {
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(2);
  }

  handlePlayerMovement() {
    const body = this.player.body;
    const movingLeft = this.cursors.left.isDown;
    const movingRight = this.cursors.right.isDown;
    const movingUp = this.cursors.up.isDown;
    const movingDown = this.cursors.down.isDown;
    const wantsJump = Phaser.Input.Keyboard.JustDown(this.cursors.space) || Phaser.Input.Keyboard.JustDown(this.cursors.up);
    const inLadderArea = Phaser.Geom.Rectangle.Contains(this.ladderArea, this.player.x, this.player.y);
    const inLadderEntryArea = Phaser.Geom.Rectangle.Contains(this.ladderEntryArea, this.player.x, this.player.y);
    const nearLadderTop = this.player.y <= this.map.tileToWorldY(20) + 8;
    const wantsToClimb = inLadderArea && (movingUp || movingDown);

    if (movingLeft) {
      body.setVelocityX(-PLAYER_SPEED);
      this.player.setFlipX(true);
    } else if (movingRight) {
      body.setVelocityX(PLAYER_SPEED);
      this.player.setFlipX(false);
    } else {
      body.setVelocityX(0);
    }

    if (wantsToClimb) {
      this.player.isClimbing = true;
      body.setAllowGravity(false);
      this.player.x = LADDER_CENTER_X;
      body.setVelocityX(0);

      if (movingUp) {
        body.setVelocityY(-LADDER_SPEED);
      } else {
        body.setVelocityY(LADDER_SPEED);
      }

      return;
    }

    if (this.player.isClimbing) {
      if (movingLeft || movingRight) {
        this.player.isClimbing = false;
      } else if (nearLadderTop && !movingDown) {
        this.player.isClimbing = false;
      } else {
        body.setAllowGravity(false);
        body.setVelocityX(0);
        body.setVelocityY(0);
        return;
      }
    }

    if (inLadderEntryArea && movingDown && body.blocked.down) {
      this.player.isClimbing = true;
      body.setAllowGravity(false);
      body.setVelocityX(0);
      body.setVelocityY(LADDER_SPEED);
      this.player.x = LADDER_CENTER_X;
      this.player.y = this.map.tileToWorldY(20) + 8;
      return;
    }

    if (this.player.isClimbing) {
      this.player.isClimbing = false;
      body.setVelocityY(0);
    }

    body.setAllowGravity(true);

    if (wantsJump && body.blocked.down) {
      body.setVelocityY(-JUMP_SPEED);
    }
  }

  getNearbyPlant() {
    return this.plants.find((plant) => {
      if (plant.collected) {
        return false;
      }

      return Phaser.Math.Distance.Between(this.player.x, this.player.y, plant.x, plant.y - 16) <= PLANT_PATCH.collectDistance;
    });
  }

  handlePlantCollection(delta) {
    // ── Result flash: show feedback briefly after release ──
    if (this.harvestState === 'result') {
      this.harvestResultTimer -= delta;
      this.harvestFeedbackText.setPosition(this.player.x, this.player.y - 72);
      if (this.harvestResultTimer <= 0) {
        this.harvestState = 'idle';
        this.harvestGfx.clear();
        this.harvestFeedbackText.setVisible(false);
      }
      return;
    }

    const nearbyPlant = this.getNearbyPlant();

    if (!nearbyPlant) {
      if (this.harvestState !== 'idle') {
        this.harvestState = 'idle';
        this.harvestGfx.clear();
      }
      return;
    }

    // ── Idle: waiting for E press ──
    if (this.harvestState === 'idle') {
      if (Phaser.Input.Keyboard.JustDown(this.collectKey)) {
        this.harvestState = 'spinning';
        this.harvestMode  = 'plant';
        this.harvestAngle = -Math.PI / 2; // start at top (12 o'clock)
        this.harvestTarget = nearbyPlant;
      }
      return;
    }

    // ── Spinning: needle sweeps, release E to stop ──
    if (this.harvestState === 'spinning') {
      this.harvestAngle += this.harvestSpeed * (delta / 1000);
      this.drawHarvestGauge(this.player.x, this.player.y - 52);

      if (Phaser.Input.Keyboard.JustUp(this.collectKey)) {
        this.finishHarvest(nearbyPlant);
      }
    }
  }

  // ── Draw the circular harvest gauge above the player ──
  drawHarvestGauge(px, py) {
    const R     = 24;
    const r     = 15;
    const ringR = (R + r) / 2;
    const ringW = R - r + 1;

    const top     = -Math.PI / 2;
    const PERFECT = Math.PI / 6;    // ±30° from 12 o'clock
    const GOOD    = Math.PI / 2.2;  // ±82° from 12 o'clock

    this.harvestGfx.clear();

    // Dark background disk
    this.harvestGfx.fillStyle(0x000000, 0.78);
    this.harvestGfx.fillCircle(px, py, R + 4);

    // Red zone (full ring as base)
    this.harvestGfx.lineStyle(ringW, 0xcc2222, 0.88);
    this.harvestGfx.beginPath();
    this.harvestGfx.arc(px, py, ringR, 0, Math.PI * 2);
    this.harvestGfx.strokePath();

    // Yellow zone (good) — two arcs flanking the green
    this.harvestGfx.lineStyle(ringW, 0xffcc00, 0.92);
    this.harvestGfx.beginPath();
    this.harvestGfx.arc(px, py, ringR, top + PERFECT, top + GOOD);
    this.harvestGfx.strokePath();
    this.harvestGfx.beginPath();
    this.harvestGfx.arc(px, py, ringR, top - GOOD, top - PERFECT);
    this.harvestGfx.strokePath();

    // Green zone (perfect) — small arc at 12 o'clock
    this.harvestGfx.lineStyle(ringW, 0x33ee77, 0.95);
    this.harvestGfx.beginPath();
    this.harvestGfx.arc(px, py, ringR, top - PERFECT, top + PERFECT);
    this.harvestGfx.strokePath();

    // Needle
    const nx = px + Math.cos(this.harvestAngle) * (R + 3);
    const ny = py + Math.sin(this.harvestAngle) * (R + 3);
    this.harvestGfx.lineStyle(2.5, 0xffffff, 1);
    this.harvestGfx.beginPath();
    this.harvestGfx.moveTo(px, py);
    this.harvestGfx.lineTo(nx, ny);
    this.harvestGfx.strokePath();

    // Needle tip
    this.harvestGfx.fillStyle(0xffffff, 1);
    this.harvestGfx.fillCircle(nx, ny, 2.5);

    // Center dot
    this.harvestGfx.fillStyle(0xffffff, 0.8);
    this.harvestGfx.fillCircle(px, py, 2.5);
  }

  // ── Evaluate result when E is released ──
  finishHarvest(plant) {
    const norm = ((this.harvestAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const top  = Math.PI * 1.5; // 270° = 12 o'clock normalized
    let dist   = Math.abs(norm - top);
    if (dist > Math.PI) dist = Math.PI * 2 - dist;

    const PERFECT = Math.PI / 6;
    const GOOD    = Math.PI / 2.2;

    let reward, msg, col;
    if (dist <= PERFECT) {
      reward = 2; msg = '✓ Отлично!  +2'; col = '#44ff88';
    } else if (dist <= GOOD) {
      reward = 1; msg = '✓ Хорошо!  +1';  col = '#ffcc00';
    } else {
      reward = 0; msg = '✗ Промах!';       col = '#ff5555';
    }

    if (reward > 0) {
      plant.collected = true;
      for (let ty = PLANT_PATCH.startY; ty <= PLANT_PATCH.endY; ty += 1) {
        for (let tx = plant.startX; tx <= plant.endX; tx += 1) {
          this.growLayer.removeTileAt(tx, ty);
        }
      }
      this.collectedPlants += reward;
      this.updatePlantsCounter();
      plant.respawnEvent = this.time.delayedCall(PLANT_PATCH.respawnDelayMs, () => {
        this.respawnPlant(plant);
      });
    }

    this.harvestFeedbackText.setText(msg);
    this.harvestFeedbackText.setColor(col);
    this.harvestFeedbackText.setPosition(this.player.x, this.player.y - 72);
    this.harvestFeedbackText.setVisible(true);
    this.harvestState       = 'result';
    this.harvestResultTimer = 900;
  }

  updatePlantsCounter() {
    if (this.plantsCounterElement) {
      this.plantsCounterElement.textContent = String(this.collectedPlants);
    }
  }

  handleMining(delta) {
    const px = this.player.x;
    const py = this.player.y - 44;

    // ── Result flash ──
    if (this.harvestState === 'result') {
      this.harvestResultTimer -= delta;
      this.harvestFeedbackText.setPosition(px, py - 28);
      if (this.harvestResultTimer <= 0) {
        this.harvestState = 'idle';
        this.harvestGfx.clear();
        this.harvestFeedbackText.setVisible(false);
      }
      this.minePrompt.setVisible(false);
      return;
    }

    // ── Idle: show prompt, wait for E press ──
    if (this.harvestState === 'idle') {
      this.minePrompt.setPosition(px, py);
      this.minePrompt.setVisible(true);
      if (Phaser.Input.Keyboard.JustDown(this.collectKey)) {
        this.harvestState = 'spinning';
        this.harvestMode  = 'ore';
        this.harvestAngle = -Math.PI / 2;
        this.minePrompt.setVisible(false);
      }
      return;
    }

    // ── Spinning: needle sweeps, release E to strike ──
    if (this.harvestState === 'spinning') {
      this.minePrompt.setVisible(false);
      this.harvestAngle += this.harvestSpeed * (delta / 1000);
      this.drawHarvestGauge(px, py - 8);

      if (Phaser.Input.Keyboard.JustUp(this.collectKey)) {
        this.finishMining();
      }
    }
  }

  finishMining() {
    const norm = ((this.harvestAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const top  = Math.PI * 1.5;
    let dist   = Math.abs(norm - top);
    if (dist > Math.PI) dist = Math.PI * 2 - dist;

    const PERFECT = Math.PI / 6;
    const GOOD    = Math.PI / 2.2;

    let reward, msg, col;
    if (dist <= PERFECT) {
      reward = 2; msg = '✓ Отлично!  +2 руды'; col = '#44ff88';
    } else if (dist <= GOOD) {
      reward = 1; msg = '✓ Хорошо!  +1 руда';  col = '#ffcc00';
    } else {
      reward = 0; msg = '✗ Промах!';             col = '#ff5555';
    }

    if (reward > 0) {
      this.collectedOre += reward;
      this.updateOreCounter();
    }

    this.harvestFeedbackText.setText(msg);
    this.harvestFeedbackText.setColor(col);
    this.harvestFeedbackText.setPosition(this.player.x, this.player.y - 72);
    this.harvestFeedbackText.setVisible(true);
    this.harvestState       = 'result';
    this.harvestResultTimer = 900;
  }

  cancelMining() {
    this.harvestState = 'idle';
    this.harvestGfx.clear();
    this.harvestFeedbackText.setVisible(false);
  }

  // ── Satiety ──────────────────────────────────────

  handleSatietyDrain(delta) {
    this.satietyTimer += delta;
    if (this.satietyTimer >= 60000) {
      this.satietyTimer -= 60000;
      if (this.satiety > 0) {
        this.satiety -= 1;
        this.updateSatietyBar();
      }
    }
  }

  handleTradeReset(delta) {
    this.tradeResetTimer -= delta;
    if (this.tradeResetTimer <= 0) {
      this.tradeResetTimer = 180000;
      this.tradeCounts = { food: 0, water: 0, bm_plants_ore: 0, bm_ore_food: 0, bm_food_water: 0, bm_water_plants: 0 };
    }
  }

  handleHouseInteraction() {
    const nearHouse = this.physics.overlap(this.player, this.houseZone);

    if (!nearHouse) {
      this.housePrompt.setVisible(false);
      return false;
    }

    const px = this.player.x;
    const py = this.player.y - 44;

    const hasIngredients = this.collectedFood >= 1 && this.collectedWater >= 1;
    const notFull        = this.satiety < this.satietyMax;

    let promptText;
    let promptColor;
    if (!notFull) {
      promptText  = 'Сытость полная';
      promptColor = '#6eff9a';
    } else if (!hasIngredients) {
      promptText  = 'Q — поесть  (нужно: 1 еда + 1 вода)';
      promptColor = '#ff9090';
    } else {
      promptText  = 'Q — поесть  (1 еда + 1 вода)';
      promptColor = '#a0e8b0';
    }

    this.housePrompt.setText(promptText);
    this.housePrompt.setColor(promptColor);
    this.housePrompt.setPosition(px, py);
    this.housePrompt.setVisible(true);

    if (Phaser.Input.Keyboard.JustDown(this.eatKey) && hasIngredients && notFull) {
      this.collectedFood  -= 1;
      this.collectedWater -= 1;
      this.satiety        += 1;
      this.updateFoodCounter();
      this.updateWaterCounter();
      this.updateSatietyBar();
    }

    return true;
  }

  updateSatietyBar() {
    if (!this.satietySegsElement || !this.satietyCounterElement) return;

    const segs = this.satietySegsElement.querySelectorAll('.satiety-seg');
    segs.forEach((seg, i) => {
      seg.classList.toggle('seg-empty', i >= this.satiety);
    });

    // Colour the filled segments based on satiety level
    const el = this.satietyCounterElement;
    el.classList.remove('sat-mid', 'sat-low', 'sat-crit');
    if      (this.satiety <= 3)  el.classList.add('sat-crit');
    else if (this.satiety <= 7)  el.classList.add('sat-low');
    else if (this.satiety <= 13) el.classList.add('sat-mid');
    // else: default green
  }

  updateOreCounter() {
    if (this.oreCounterElement) {
      this.oreCounterElement.textContent = String(this.collectedOre);
    }
  }

  updateFoodCounter() {
    if (this.foodCounterElement) {
      this.foodCounterElement.textContent = String(this.collectedFood);
    }
  }

  updateWaterCounter() {
    if (this.waterCounterElement) {
      this.waterCounterElement.textContent = String(this.collectedWater);
    }
  }

  handleRocketInteraction() {
    const nearRocket = this.physics.overlap(this.player, this.rocketZone);

    if (!nearRocket) {
      this.tradePrompt.setVisible(false);
      return false;
    }

    // Show prompt above player
    this.tradePrompt.setPosition(this.player.x, this.player.y - 44);
    this.tradePrompt.setVisible(true);

    if (Phaser.Input.Keyboard.JustDown(this.tradeKey)) {
      this.openTradeMenu();
    }

    return true; // consumed — skip plant collection
  }

  openTradeMenu() {
    this.tradePrompt.setVisible(false);
    this.scene.launch('TradeScene', {
      resources: {
        plants: this.collectedPlants,
        ore:    this.collectedOre,
        food:   this.collectedFood,
        water:  this.collectedWater,
      },
      tradeCounts:   { ...this.tradeCounts },
      resetTimeLeft: this.tradeResetTimer,
      onClose: (updated) => {
        this.collectedPlants  = updated.plants;
        this.collectedOre     = updated.ore;
        this.collectedFood    = updated.food;
        this.collectedWater   = updated.water;
        this.tradeCounts      = { ...updated.tradeCounts };
        this.tradeResetTimer  = updated.resetTimeLeft;
        this.updatePlantsCounter();
        this.updateOreCounter();
        this.updateFoodCounter();
        this.updateWaterCounter();
      },
    });
    this.scene.pause();
  }

  // ════════════════════════════════════════════════
  //  HARVEST GAUGE  (plant mini-game)
  // ════════════════════════════════════════════════

  createHarvestGauge() {
    this.harvestGfx = this.add.graphics();
    this.harvestGfx.setDepth(3000);

    this.harvestFeedbackText = this.add.text(0, 0, '', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.harvestFeedbackText.setOrigin(0.5, 1);
    this.harvestFeedbackText.setDepth(3001);
    this.harvestFeedbackText.setVisible(false);

    this.harvestState       = 'idle';   // 'idle' | 'spinning' | 'result'
    this.harvestMode        = 'none';   // 'plant' | 'ore'
    this.harvestAngle       = -Math.PI / 2;
    this.harvestSpeed       = Math.PI * 1.8; // radians / second
    this.harvestTarget      = null;
    this.harvestResultTimer = 0;
  }

  respawnPlant(plant) {
    for (let rowIndex = 0; rowIndex < plant.tiles.length; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < plant.tiles[rowIndex].length; columnIndex += 1) {
        const tileIndex = plant.tiles[rowIndex][columnIndex];
        const tileX = plant.startX + columnIndex;
        const tileY = PLANT_PATCH.startY + rowIndex;

        if (tileIndex > -1) {
          this.growLayer.putTileAt(tileIndex, tileX, tileY);
        } else {
          this.growLayer.removeTileAt(tileX, tileY);
        }
      }
    }

    plant.collected = false;
    plant.respawnEvent = null;
  }

  updateInteractionText() {
    const nearbyPlant = this.getNearbyPlant();

    // Show prompt only in idle state; gauge replaces it while spinning
    if (nearbyPlant && this.harvestState === 'idle') {
      this.plantPrompt.setText('Удержи E для сбора');
      this.plantPrompt.setPosition(nearbyPlant.x, nearbyPlant.y - 40);
      this.plantPrompt.setVisible(true);
    } else if (this.harvestState !== 'result') {
      this.plantPrompt.setVisible(false);
    }

  }
}

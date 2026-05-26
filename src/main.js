import Phaser from 'phaser';
import './style.css';
import MenuScene  from './scenes/MenuScene.js';
import GameScene  from './scenes/GameScene.js';
import TradeScene from './scenes/TradeScene.js';

const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game',
  pixelArt: true,
  backgroundColor: '#101820',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 900 },
      debug: false
    }
  },
  scene: [MenuScene, GameScene, TradeScene]
};

const game = new Phaser.Game(config);

const menuBtn = document.getElementById('menu-btn');
menuBtn.addEventListener('click', () => {
  game.scene.stop('GameScene');
  game.scene.start('MenuScene');
});

// Show button only when GameScene is active
game.events.on('ready', () => {
  game.scene.getScene('GameScene').events.on('create', () => { menuBtn.hidden = false; });
  game.scene.getScene('GameScene').events.on('shutdown', () => { menuBtn.hidden = true; });
  game.scene.getScene('MenuScene').events.on('create', () => { menuBtn.hidden = true; });
});

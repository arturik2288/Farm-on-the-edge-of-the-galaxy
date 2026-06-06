import Phaser from 'phaser';

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    const { width, height } = this.scale;

    this.add.rectangle(0, 0, width, height, 0x101820).setOrigin(0, 0);

    // Stars background
    for (let i = 0; i < 120; i++) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
      const size = Phaser.Math.Between(1, 3);
      const alpha = Phaser.Math.FloatBetween(0.3, 1);
      this.add.rectangle(x, y, size, size, 0xffffff, alpha);
    }

    // Title
    this.add.text(width / 2, height * 0.28, 'Farm On The Edge', {
      fontFamily: 'monospace',
      fontSize: '52px',
      color: '#f5e6a3',
      stroke: '#000000',
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.28 + 64, 'of the Galaxy', {
      fontFamily: 'monospace',
      fontSize: '38px',
      color: '#a3d4f5',
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5);

    // Play button
    const btnWidth = 260;
    const btnHeight = 64;
    const btnX = width / 2;
    const btnY = height * 0.62;

    const btnBg = this.add.rectangle(btnX, btnY, btnWidth, btnHeight, 0x2a6e3f)
      .setStrokeStyle(3, 0x6ef09a)
      .setInteractive({ useHandCursor: true });

    const btnText = this.add.text(btnX, btnY, 'Играть', {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#ffffff',
    }).setOrigin(0.5);

    btnBg.on('pointerover', () => {
      btnBg.setFillStyle(0x3a9e58);
      btnText.setScale(1.05);
    });

    btnBg.on('pointerout', () => {
      btnBg.setFillStyle(0x2a6e3f);
      btnText.setScale(1);
    });

    btnBg.on('pointerdown', () => {
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.time.delayedCall(400, () => {
        this.scene.start('GameScene');
      });
    });

    // Hint
    this.add.text(width / 2, height * 0.82, '← → ходить  |  Space прыгать  |  E добыть  |  ↑↓ лестница  |  T терминал', {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#888888',
    }).setOrigin(0.5);

    this.cameras.main.fadeIn(500, 0, 0, 0);
  }
}

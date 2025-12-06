import Phaser from 'phaser';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  preload() {
    // сюда потом добавим загрузку картинок, спрайтов и т.п.
  }

  create() {
    // пока просто фон и текст, чтобы проверить, что всё работает
    this.cameras.main.setBackgroundColor('#1a1a2e');

    const text = this.add.text(20, 20, 'Space Econ Game', {
      fontSize: '24px',
      fill: '#ffffff'
    });

    text.setScrollFactor(0);
  }

  update(time, delta) {
    // здесь потом будет логика (движение игрока, ресурсы и т.д.)
  }
}

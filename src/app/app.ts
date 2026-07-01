import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, OnInit, ViewChild,ChangeDetectorRef  } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {

    // ============================
  // SECTION 1: ALL THE VARIABLES
  // ============================

  // Flask backend address
  apiUrl = 'https://sheldon-portfolio.onrender.com';

  // which screen to show: 'start', 'game', or 'gameover'
  screen = 'start';

  // what the user types in the input boxes
  username = '';
  comment = '';

  // leaderboard data from Flask
  topScores: any[] = [];
  lastComment = 'No comments yet';

  // current game score
  score = 0;

  // we store the score id so we can attach a comment to it later
  lastScoreId: number | null = null;

  // this finds the <canvas #gameCanvas> element in the HTML
  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  // the canvas drawing tool (like a marker for the whiteboard)
  private ctx!: CanvasRenderingContext2D;

  // is the game currently running?
  private gameRunning = false;

  // tracks which keys are held down right now
  // example: { 'KeyA': true, 'KeyD': false }
  private keys: { [key: string]: boolean } = {};

  // player position and size
  private player = {
    x: 400,      // starts at horizontal center
    y: 560,      // starts near the bottom
    width: 30,
    height: 30,
    speed: 2     // pixels moved per frame
  };

  // list of bullets currently on screen
  // each bullet is just { x, y }
  private bullets: { x: number; y: number }[] = [];

  // list of enemies currently on screen
  // each enemy is just { x, y, radius }
  private enemies: { x: number; y: number; radius: number }[] = [];

  // tracks when we last spawned an enemy (in milliseconds)
  private lastEnemySpawn = 0;

  // how often to spawn a new enemy (every 1500ms = 1.5 seconds)
  private spawnInterval = 1500;

  // maximum enemies allowed on screen at once
  private maxEnemies = 5;

  // we store keyboard functions here so we can remove them later
  private keydownHandler!: (e: KeyboardEvent) => void;
  private keyupHandler!: (e: KeyboardEvent) => void;

  // expose player x to the template for the slider
  player_x = 400;
  private autoFireInterval: any = null;


  // ============================
  // SECTION 2: SETUP
  // ============================

  // HttpClient lets us talk to Flask (GET, POST requests)
  constructor(private http: HttpClient,  private cdr: ChangeDetectorRef) {}

  // ngOnInit runs once when the page first loads
  ngOnInit() {
    this.loadLeaderboard();
  }

  // ============================
  // SECTION 3: LEADERBOARD
  // ============================

  // fetch top scores and last comment from Flask
  loadLeaderboard() {
    this.http.get<any>(`${this.apiUrl}/api/leaderboard`).subscribe({
      next: (data) => {
        this.topScores = data.top_scores;
        this.lastComment = data.last_comment || 'No comments yet';
      },
      error: () => {
        // Flask not running yet - that's ok, just show empty leaderboard
        this.topScores = [];
        this.lastComment = 'No comments yet';
      }
    });
  }

  // ============================
  // SECTION 4: START GAME
  // ============================

  startGame() {
    // reset everything back to zero
    this.score = 0;
    this.bullets = [];
    this.enemies = [];
    this.player.x = 400;
    this.lastEnemySpawn = 0;
    this.gameRunning = true;

    // switch to the game screen
    this.screen = 'game';

    // wait a tiny moment for Angular to render the canvas
    // then grab it and start the game loop
    setTimeout(() => {
      const canvas = this.canvasRef.nativeElement;
      this.ctx = canvas.getContext('2d')!;
      this.setupKeyboard();
      this.startAutoFire();   
      requestAnimationFrame((t) => this.gameLoop(t));
    }, 50);
  }

  // ============================
  // SECTION 5: KEYBOARD
  // ============================

  setupKeyboard() {
    // when a key is pressed down
    this.keydownHandler = (e: KeyboardEvent) => {
      this.keys[e.code] = true;

      // spacebar fires a bullet
      if (e.code === 'Space' && this.gameRunning) {
        e.preventDefault(); // stops page from scrolling
        this.bullets.push({ x: this.player.x, y: this.player.y });
      }
    };

    // when a key is released
    this.keyupHandler = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
    };

    window.addEventListener('keydown', this.keydownHandler);
    window.addEventListener('keyup', this.keyupHandler);
  }

  // remove keyboard listeners when game ends
  removeKeyboard() {
    window.removeEventListener('keydown', this.keydownHandler);
    window.removeEventListener('keyup', this.keyupHandler);
  }

  // ============================
  // SECTION 6: GAME LOOP
  // ============================

  // this runs ~60 times per second
  // each time it updates positions then redraws everything
  gameLoop(timestamp: number) {
    if (!this.gameRunning) return;

    this.update(timestamp);  // move everything
    this.draw();             // draw everything

    // schedule the next frame
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  // ============================
  // SECTION 7: UPDATE (MOVEMENT)
  // ============================

  update(timestamp: number) {
    const canvas = this.canvasRef.nativeElement;

    // move player left if A is held
    if (this.keys['KeyA'] && this.player.x - this.player.width / 2 > 0) {
      this.player.x -= this.player.speed;
    }

    // move player right if D is held
    if (this.keys['KeyD'] && this.player.x + this.player.width / 2 < canvas.width) {
      this.player.x += this.player.speed;
    }

    // move every bullet upward
    this.bullets.forEach(b => b.y -= 3);

    // remove bullets that went off the top of the screen
    this.bullets = this.bullets.filter(b => b.y > 0);

    // move every enemy downward
    this.enemies.forEach(en => en.y += 1);

    // spawn a new enemy every 1.5 seconds if below max
    if (timestamp - this.lastEnemySpawn > this.spawnInterval) {
      if (this.enemies.length < this.maxEnemies) {
        this.spawnEnemy();
      }
      this.lastEnemySpawn = timestamp;
    }

    // check if any bullet hit any enemy
    this.checkCollisions();

    // check if any enemy reached the bottom
    for (const en of this.enemies) {
      if (en.y + en.radius >= canvas.height) {
        debugger;
        this.endGame();
      }
    }
  }

  // ============================
  // SECTION 8: SPAWN ENEMY
  // ============================

  spawnEnemy() {
    const canvas = this.canvasRef.nativeElement;
    const radius = 15;

    // pick a random x position across the canvas width
    const x = Math.random() * (canvas.width - radius * 2) + radius;

    // start just above the top of the screen (y = -radius)
    this.enemies.push({ x, y: -radius, radius });
  }

  // ============================
  // SECTION 9: COLLISIONS
  // ============================

  checkCollisions() {
    // loop backwards so splicing doesn't break the index
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const b = this.bullets[i];
        const en = this.enemies[j];

        // distance formula: how far apart are bullet and enemy?
        const dx = b.x - en.x;
        const dy = b.y - en.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // if distance is less than enemy radius = hit!
        if (distance < en.radius) {
          this.bullets.splice(i, 1);  // remove bullet
          this.enemies.splice(j, 1);  // remove enemy
          this.score++;               // add 1 to score
          break;
        }
      }
    }
  }

  // ============================
  // SECTION 10: DRAW
  // ============================

  draw() {
    const canvas = this.canvasRef.nativeElement;
    const ctx = this.ctx;

    // wipe the canvas white every frame
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'black';

    // draw player as a triangle
    ctx.beginPath();
    ctx.moveTo(this.player.x, this.player.y - this.player.height / 2); // top tip
    ctx.lineTo(this.player.x - this.player.width / 2, this.player.y + this.player.height / 2); // bottom left
    ctx.lineTo(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2); // bottom right
    ctx.closePath();
    ctx.fill();

    // draw each bullet as a small circle
    this.bullets.forEach(b => {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // draw each enemy as a bigger circle
    this.enemies.forEach(en => {
      ctx.beginPath();
      ctx.arc(en.x, en.y, en.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    // draw score text in top left
    ctx.font = '20px Arial';
    ctx.fillText('Score: ' + this.score, 10, 25);
  }

  // ============================
  // SECTION 11: GAME OVER
  // ============================

  endGame() {
    this.gameRunning = false;  // stops the game loop
    this.removeKeyboard();     // stop listening to keys
    this.stopAutoFire(); 
    this.screen = 'gameover';  // show game over screen
    this.cdr.detectChanges();

    // send score to Flask to save in SQLite
    this.http.post<any>(`${this.apiUrl}/api/save_score`, {
      username: this.username || 'Anonymous',
      score: this.score
    }).subscribe(data => {
      this.lastScoreId = data.score_id;
      this.loadLeaderboard(); // refresh leaderboard
    });
  }

  // ============================
  // SECTION 12: SAVE COMMENT
  // ============================

  saveComment() {
    if (!this.comment.trim() || !this.lastScoreId) return;

    this.http.post<any>(`${this.apiUrl}/api/save_comment`, {
      score_id: this.lastScoreId,
      comment: this.comment
    }).subscribe(() => {
      this.comment = '';
      this.loadLeaderboard();
    });
  }

  // ============================
  // SECTION 13: PLAY AGAIN
  // ============================

  goToStart() {
    this.screen = 'start';
  }

  // called every time the slider moves
  onSliderMove(event: Event) {
    const input = event.target as HTMLInputElement;
    // move player to wherever the slider is
    this.player.x = Number(input.value);
    this.player_x = this.player.x;
  }

  // fires 3 bullets per second automatically
startAutoFire() {
  // clear any existing interval first
  this.stopAutoFire();

  // every 333ms = 3 times per second
  this.autoFireInterval = setInterval(() => {
    if (this.gameRunning) {
      this.bullets.push({ x: this.player.x, y: this.player.y });
    }
  }, 333);
}

// stop auto fire when game ends
stopAutoFire() {
  if (this.autoFireInterval) {
    clearInterval(this.autoFireInterval);
    this.autoFireInterval = null;
  }
}

}

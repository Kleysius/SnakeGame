const gameBoard = document.getElementById("game-board");
const startBtn = document.getElementById("startButton");
const restartButton = document.getElementById("restartButton");
const modal = document.getElementById("modal");
const modalContent = document.getElementById("modal-content");
const message = document.getElementById("message");
const topScores = document.getElementById("scores");
const cellSize = 25;
const scores = [];
let snake = [{ x: 2, y: 2 }];
let food = { x: 10, y: 10 };
let mouse = { x: 15, y: 15 };
let direction = "right";
let isGameOver = false;
let speed = 100;
let score = 0;
let foodEaten = 0;
let intervalId = null;
let interMouse = null;

function startGame() {
  isGameOver = false;
  intervalId = setInterval(() => { move(); draw(); }, speed);
  interMouse = setInterval(generateMouse, 2500);
  modal.style.display = "none";
}

startBtn.addEventListener("click", startGame);

function createElement(className, x, y) {
  const element = document.createElement("div");
  element.className = className;
  element.style.left = x * cellSize + "px";
  element.style.top = y * cellSize + "px";
  gameBoard.appendChild(element);
  return element;
}

function draw() {
  gameBoard.innerHTML = "";
  const snakeHead = createElement("snake-head", snake[0].x, snake[0].y);
  snakeHead.style.transform = `rotate(${direction === "right" ? -90 : direction === "left" ? 90 : direction === "down" ? 0 : 180}deg)`;
  for (let i = 1; i < snake.length; i++) { createElement("snake-body", snake[i].x, snake[i].y); }
  createElement("food", food.x, food.y);
  createElement("mouse", mouse.x, mouse.y);
}

function move() {
  if (isGameOver) return;
  let newHead = { x: snake[0].x, y: snake[0].y };
  const { clientWidth, clientHeight } = gameBoard;
  switch (direction) {
    case "up": newHead.y--; break;
    case "down": newHead.y++; break;
    case "left": newHead.x--; break;
    case "right": newHead.x++; break;
  }
  if (newHead.x < 0 || newHead.x >= clientWidth / cellSize || newHead.y < 0 || newHead.y >= clientHeight / cellSize) { stopGame(); return; }
  if (snake.slice(1).some(s => s.x === newHead.x && s.y === newHead.y)) { stopGame(); return; }
  snake.unshift(newHead);
  const isFoodEaten = newHead.x === food.x && newHead.y === food.y;
  const isMouseEaten = newHead.x === mouse.x && newHead.y === mouse.y;
  if (isFoodEaten || isMouseEaten) {
    score += isFoodEaten ? 150 : 350;
    updateScore();
    isFoodEaten ? (foodEaten++, updateFoodEaten(), generateFood()) : (clearInterval(interMouse), generateMouse(), interMouse = setInterval(generateMouse, 2500));
  } else { snake.pop(); }
}

function generateFood() {
  const { clientWidth, clientHeight } = gameBoard;
  food.x = Math.floor(Math.random() * clientWidth / cellSize);
  food.y = Math.floor(Math.random() * clientHeight / cellSize);
}

function generateMouse() {
  const { clientWidth, clientHeight } = gameBoard;
  mouse.x = Math.floor(Math.random() * clientWidth / cellSize);
  mouse.y = Math.floor(Math.random() * clientHeight / cellSize);
}

function stopGame() {
  isGameOver = true;
  clearInterval(intervalId);
  clearInterval(interMouse);
  modal.style.display = "flex";
  modalContent.style.display = "none";
  message.style.display = "flex";
  restartButton.style.display = "flex";
  addScore(score);
  displayScores();
  restartButton.addEventListener("click", restartGame);
  gameBoard.style.opacity = 0.5;
}

function restartGame() {
  isGameOver = false;
  snake = [{ x: 2, y: 2 }];
  direction = "right";
  modal.style.display = "none";
  message.style.display = "none";
  restartButton.style.display = "none";
  gameBoard.style.opacity = 1;
  score = 0;
  foodEaten = 0;
  updateScore();
  updateFoodEaten();
  startGame();
}

function updateFoodEaten() {
  document.getElementById("food-eaten").innerHTML = `<img src="images/apple.svg" alt="food eaten"> ${foodEaten}`;
}

function updateScore() {
  document.getElementById("score").innerHTML = `<img src="images/trophy.svg" alt="score"> ${score}`;
  if (score > 0 && score % 1000 === 0) { increaseDifficulty(); }
}

function increaseDifficulty() {
  speed -= 10;
  clearInterval(intervalId);
  intervalId = setInterval(() => { move(); draw(); }, speed);
}

function addScore(playerScore) {
  scores.push(playerScore);
  scores.sort((a, b) => b - a);
}

function displayScores() {
  const scoreList = document.getElementById("scores-list");
  scoreList.innerHTML = "";
  scores.forEach((playerScore, index) => {
    const listItem = document.createElement("li");
    listItem.textContent = `Score ${index + 1} : ${playerScore}`;
    scoreList.appendChild(listItem);
  });
}

document.addEventListener("keydown", (event) => {
  switch (event.key) {
    case "z": direction = "up"; break;
    case "s": direction = "down"; break;
    case "q": direction = "left"; break;
    case "d": direction = "right"; break;
  }
});

updateScore();
updateFoodEaten();
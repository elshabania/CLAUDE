#!/usr/bin/env python3
"""A classic Snake game using tkinter (no external dependencies).

Run it with:  python snake.py
Controls:     arrow keys or WASD to move, 'r' to restart, Esc/Q to quit.
"""

import random
import tkinter as tk

CELL = 20            # pixel size of one grid cell
COLS = 30            # grid width in cells
ROWS = 24            # grid height in cells
WIDTH = COLS * CELL
HEIGHT = ROWS * CELL
TICK_MS = 110        # game speed (lower = faster)

BG = "#101418"
GRID = "#1b2026"
SNAKE = "#4ade80"
HEAD = "#22c55e"
FOOD = "#f87171"
TEXT = "#e5e7eb"

DIRECTIONS = {
    "Up": (0, -1), "Down": (0, 1), "Left": (-1, 0), "Right": (1, 0),
    "w": (0, -1), "s": (0, 1), "a": (-1, 0), "d": (1, 0),
}


class SnakeGame:
    def __init__(self, root):
        self.root = root
        self.root.title("Snake")
        self.root.resizable(False, False)

        self.canvas = tk.Canvas(
            root, width=WIDTH, height=HEIGHT, bg=BG, highlightthickness=0
        )
        self.canvas.pack()

        for key in ("<Up>", "<Down>", "<Left>", "<Right>",
                    "w", "a", "s", "d", "r", "q", "<Escape>"):
            root.bind(key, self.on_key)

        self.reset()
        self.loop()

    def reset(self):
        cx, cy = COLS // 2, ROWS // 2
        self.snake = [(cx - 1, cy), (cx, cy), (cx + 1, cy)]
        self.direction = (1, 0)
        self.next_direction = (1, 0)
        self.food = self.spawn_food()
        self.score = 0
        self.game_over = False

    def spawn_food(self):
        free = {(x, y) for x in range(COLS) for y in range(ROWS)} - set(self.snake)
        return random.choice(tuple(free)) if free else None

    def on_key(self, event):
        key = event.keysym
        if key in ("Escape", "q"):
            self.root.destroy()
            return
        if key == "r":
            self.reset()
            return
        if self.game_over:
            return
        if key in DIRECTIONS:
            dx, dy = DIRECTIONS[key]
            # prevent reversing directly into the snake's neck
            if (dx, dy) != (-self.direction[0], -self.direction[1]):
                self.next_direction = (dx, dy)

    def step(self):
        if self.game_over:
            return
        self.direction = self.next_direction
        head_x, head_y = self.snake[-1]
        dx, dy = self.direction
        new_head = (head_x + dx, head_y + dy)
        nx, ny = new_head

        if nx < 0 or nx >= COLS or ny < 0 or ny >= ROWS or new_head in self.snake:
            self.game_over = True
            return

        self.snake.append(new_head)
        if new_head == self.food:
            self.score += 1
            self.food = self.spawn_food()
            if self.food is None:        # board full = you win
                self.game_over = True
        else:
            self.snake.pop(0)

    def draw(self):
        c = self.canvas
        c.delete("all")

        # subtle grid
        for x in range(0, WIDTH, CELL):
            c.create_line(x, 0, x, HEIGHT, fill=GRID)
        for y in range(0, HEIGHT, CELL):
            c.create_line(0, y, WIDTH, y, fill=GRID)

        if self.food:
            self.draw_cell(self.food, FOOD)
        for i, segment in enumerate(self.snake):
            self.draw_cell(segment, HEAD if i == len(self.snake) - 1 else SNAKE)

        c.create_text(8, 8, anchor="nw", fill=TEXT,
                      font=("Helvetica", 12, "bold"),
                      text=f"Score: {self.score}")

        if self.game_over:
            won = len(self.snake) == COLS * ROWS
            msg = "You Win!" if won else "Game Over"
            c.create_text(WIDTH // 2, HEIGHT // 2 - 12, fill=TEXT,
                          font=("Helvetica", 28, "bold"), text=msg)
            c.create_text(WIDTH // 2, HEIGHT // 2 + 20, fill=TEXT,
                          font=("Helvetica", 13),
                          text="Press 'r' to play again  ·  'q' to quit")

    def draw_cell(self, pos, color):
        x, y = pos
        self.canvas.create_rectangle(
            x * CELL + 1, y * CELL + 1,
            (x + 1) * CELL - 1, (y + 1) * CELL - 1,
            fill=color, outline="")

    def loop(self):
        self.step()
        self.draw()
        self.root.after(TICK_MS, self.loop)


def main():
    root = tk.Tk()
    SnakeGame(root)
    root.mainloop()


if __name__ == "__main__":
    main()

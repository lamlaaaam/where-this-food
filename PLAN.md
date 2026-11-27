Create a web-based game called "Where This Food" (WTF) that can be hosted on GitHub pages. I recommend using the Phaser game engine, but you are free to pick a better alternative. This game will be played as follows:
1. Player clicks start.
2. Game picks a food place, for now it will be bounded to Singapore. The player will try to guess this place.
3. Game shows 5 Google reviews for this place, one for each rating star (i.e., one one-star review, one two-star review.. up to one five-star review).
4. Player can uncover more hints, but will lose points the more hints they use. For now, these hints will be: A picture of the place taken from Google Maps, the nearest MRT, the nearest well-known landmark (e.g., Merlion), cuisine type, picture of the menu, picture of the food.
5. Player tries to guess the place by putting a pin on an interactive Google Maps-like interface, similar to Geoguessr. The interface should show food places when zoomed in sufficiently, and the pin should snap to these food places.
6. After confirming their guess, the game tells them whether they are correct. They get 1 guess per round.
7. An answer gives points based on how close the pin is. As they use more hints or attempts, their points decrease. The interface should show them the points they will score in real-time.
8. The game will go for 5 rounds. The final score is the sum of scores of each round. The maximum point for each round is 100, and hence total is out of 500.
9. After 5 rounds, the player can click "Play Again" to replay.

Notes:
1. I recommend using Phaser for the game engine, but again, you are free to recommend better alternatives.
2. I recommend using the Google Places API to retrieve information about the food place.
3. Make the UI aesthetically pleasing and modern.
4. Make it playable both on desktop and mobile, in the web.
5. Optionally, make the game multiplayer with a leaderboard, and players can submit their scores with their names.
6. Make the game lightweight and quick to load.
7. Feel free to suggest or point out any changes you think might make the game better.
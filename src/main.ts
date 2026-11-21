import './styles.css'
import { Game } from './game/game'

const root = document.getElementById('app')
if (!root) throw new Error('Missing #app element')

const game = new Game(root)
void game.boot()

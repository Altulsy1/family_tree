// server.js - خادم WebSocket متكامل مع دعم الغرف والذكاء الاصطناعي
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
    if (req.url === '/') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    }
});

const wss = new WebSocket.Server({ server });

// تخزين الغرف النشطة
const rooms = new Map();
const players = new Map();

// إحصائيات عامة
const stats = {
    totalGames: 0,
    activePlayers: 0,
    totalRooms: 0,
    startTime: Date.now()
};

// إنشاء رمز غرفة عشوائي
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code;
    do {
        code = '';
        for (let i = 0; i < 4; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
    } while (rooms.has(code));
    return code;
}

// إرسال رسالة لجميع لاعبي الغرفة
function broadcastToRoom(roomCode, message, excludeWs = null) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const messageStr = JSON.stringify(message);
    room.players.forEach(player => {
        if (player.ws !== excludeWs && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(messageStr);
        }
    });
}

// تحديث قائمة اللاعبين في الغرفة
function updateRoomPlayers(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const playersList = room.players.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isHost: p.isHost,
        ready: p.ready || false
    }));
    
    broadcastToRoom(roomCode, {
        type: 'PLAYERS_UPDATE',
        players: playersList
    });
}

// حذف الغرف الفارغة
setInterval(() => {
    rooms.forEach((room, code) => {
        if (room.players.length === 0) {
            rooms.delete(code);
        }
    });
    
    // تحديث الإحصائيات
    stats.totalRooms = rooms.size;
    stats.activePlayers = players.size;
}, 30000);

wss.on('connection', (ws) => {
    console.log('🟢 اتصال جديد');
    stats.activePlayers = players.size + 1;
    
    // إرسال الإحصائيات العامة
    ws.send(JSON.stringify({
        type: 'GLOBAL_STATS',
        online: stats.activePlayers,
        games: stats.totalGames,
        rooms: stats.totalRooms
    }));
    
    let currentPlayer = null;
    let currentRoom = null;
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('📩 رسالة:', data.type);
            
            switch(data.type) {
                
                case 'CREATE_ROOM':
                    // إنشاء غرفة جديدة
                    const roomCode = generateRoomCode();
                    const playerId = `host_${Date.now()}`;
                    
                    currentPlayer = {
                        id: playerId,
                        name: data.playerName || 'مضيف',
                        avatar: data.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${playerId}`,
                        isHost: true,
                        ws: ws,
                        ready: true
                    };
                    
                    rooms.set(roomCode, {
                        code: roomCode,
                        hostId: playerId,
                        players: [currentPlayer],
                        maxPlayers: 4,
                        status: 'waiting',
                        createdAt: Date.now(),
                        gameState: null
                    });
                    
                    currentRoom = roomCode;
                    players.set(playerId, currentPlayer);
                    
                    ws.send(JSON.stringify({
                        type: 'ROOM_CREATED',
                        roomCode: roomCode,
                        playerId: playerId,
                        isHost: true
                    }));
                    
                    stats.totalRooms = rooms.size;
                    console.log(`🏠 غرفة جديدة: ${roomCode}`);
                    break;
                
                case 'JOIN_ROOM':
                    // الانضمام لغرفة
                    const targetRoom = rooms.get(data.roomCode);
                    
                    if (!targetRoom) {
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            message: 'الغرفة غير موجودة'
                        }));
                        return;
                    }
                    
                    if (targetRoom.players.length >= targetRoom.maxPlayers) {
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            message: 'الغرفة ممتلئة'
                        }));
                        return;
                    }
                    
                    if (targetRoom.status === 'playing') {
                        ws.send(JSON.stringify({
                            type: 'ERROR',
                            message: 'اللعبة بدأت بالفعل'
                        }));
                        return;
                    }
                    
                    const newPlayerId = `player_${Date.now()}`;
                    currentPlayer = {
                        id: newPlayerId,
                        name: data.playerName || 'لاعب',
                        avatar: data.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${newPlayerId}`,
                        isHost: false,
                        ws: ws,
                        ready: true
                    };
                    
                    targetRoom.players.push(currentPlayer);
                    currentRoom = data.roomCode;
                    players.set(newPlayerId, currentPlayer);
                    
                    ws.send(JSON.stringify({
                        type: 'JOINED_ROOM',
                        roomCode: data.roomCode,
                        playerId: newPlayerId,
                        isHost: false
                    }));
                    
                    // إخبار الجميع بالتحديث
                    updateRoomPlayers(data.roomCode);
                    
                    console.log(`👤 انضم ${currentPlayer.name} إلى ${data.roomCode}`);
                    break;
                
                case 'PLAYER_READY':
                    if (currentPlayer && currentRoom) {
                        currentPlayer.ready = data.ready;
                        updateRoomPlayers(currentRoom);
                    }
                    break;
                
                case 'START_GAME':
                    // بدء اللعبة
                    if (currentPlayer?.isHost && currentRoom) {
                        const room = rooms.get(currentRoom);
                        if (room && room.players.length >= 2) {
                            room.status = 'playing';
                            
                            // تهيئة حالة اللعبة
                            const gameState = {
                                currentRound: 1,
                                startTime: Date.now(),
                                playersCards: {},
                                roundWinner: null,
                                gameActive: true
                            };
                            
                            // توزيع البطاقات
                            const fruits = ['🍎', '🍌', '🍊', '🍇', '🍓', '🍉', '🍒', '🍍'];
                            const allCards = [];
                            for (let i = 0; i < 16; i++) {
                                allCards.push({
                                    id: `card_${i}_${Date.now()}`,
                                    emoji: fruits[Math.floor(Math.random() * fruits.length)],
                                    fruitId: Math.floor(Math.random() * fruits.length)
                                });
                            }
                            
                            // خلط البطاقات
                            for (let i = allCards.length - 1; i > 0; i--) {
                                const j = Math.floor(Math.random() * (i + 1));
                                [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
                            }
                            
                            // توزيع على اللاعبين
                            room.players.forEach((player, index) => {
                                gameState.playersCards[player.id] = allCards.slice(index * 4, (index + 1) * 4);
                            });
                            
                            room.gameState = gameState;
                            
                            // إرسال لكل لاعب بطاقاته
                            room.players.forEach(player => {
                                if (player.ws.readyState === WebSocket.OPEN) {
                                    player.ws.send(JSON.stringify({
                                        type: 'GAME_STARTED',
                                        gameState: {
                                            ...gameState,
                                            playersCards: {
                                                [player.id]: gameState.playersCards[player.id]
                                            }
                                        },
                                        players: room.players.map(p => ({
                                            id: p.id,
                                            name: p.name,
                                            avatar: p.avatar,
                                            cardCount: gameState.playersCards[p.id].length
                                        }))
                                    }));
                                }
                            });
                            
                            stats.totalGames++;
                            console.log(`🎮 بدأت اللعبة في ${currentRoom}`);
                        }
                    }
                    break;
                
                case 'WIN_ROUND':
                    // لاعب أعلن الفوز
                    if (currentPlayer && currentRoom) {
                        const room = rooms.get(currentRoom);
                        if (room && room.status === 'playing' && !room.gameState.roundWinner) {
                            room.gameState.roundWinner = currentPlayer.id;
                            room.gameState.gameActive = false;
                            
                            // حساب وقت الفوز
                            const winTime = Math.floor((Date.now() - room.gameState.startTime) / 1000);
                            
                            broadcastToRoom(currentRoom, {
                                type: 'ROUND_WON',
                                winnerId: currentPlayer.id,
                                winnerName: currentPlayer.name,
                                winTime: winTime
                            });
                            
                            console.log(`🏆 فاز ${currentPlayer.name} في ${winTime} ثانية`);
                        }
                    }
                    break;
                
                case 'NEXT_ROUND':
                    // جولة جديدة
                    if (currentPlayer?.isHost && currentRoom) {
                        const room = rooms.get(currentRoom);
                        if (room) {
                            room.gameState.currentRound++;
                            room.gameState.roundWinner = null;
                            room.gameState.gameActive = true;
                            room.gameState.startTime = Date.now();
                            
                            // إعادة توزيع البطاقات
                            const fruits = ['🍎', '🍌', '🍊', '🍇', '🍓', '🍉', '🍒', '🍍'];
                            const allCards = [];
                            for (let i = 0; i < 16; i++) {
                                allCards.push({
                                    id: `card_${i}_${Date.now()}`,
                                    emoji: fruits[Math.floor(Math.random() * fruits.length)],
                                    fruitId: Math.floor(Math.random() * fruits.length)
                                });
                            }
                            
                            for (let i = allCards.length - 1; i > 0; i--) {
                                const j = Math.floor(Math.random() * (i + 1));
                                [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
                            }
                            
                            room.players.forEach((player, index) => {
                                room.gameState.playersCards[player.id] = allCards.slice(index * 4, (index + 1) * 4);
                            });
                            
                            // إرسال البطاقات الجديدة
                            room.players.forEach(player => {
                                if (player.ws.readyState === WebSocket.OPEN) {
                                    player.ws.send(JSON.stringify({
                                        type: 'NEW_ROUND',
                                        round: room.gameState.currentRound,
                                        cards: room.gameState.playersCards[player.id],
                                        startTime: room.gameState.startTime
                                    }));
                                }
                            });
                        }
                    }
                    break;
                
                case 'LEAVE_ROOM':
                    // مغادرة الغرفة
                    if (currentPlayer && currentRoom) {
                        const room = rooms.get(currentRoom);
                        if (room) {
                            room.players = room.players.filter(p => p.id !== currentPlayer.id);
                            
                            if (room.players.length > 0) {
                                // إذا رحل المضيف، اجعل أول لاعب هو المضيف الجديد
                                if (currentPlayer.isHost && room.players.length > 0) {
                                    room.players[0].isHost = true;
                                }
                                updateRoomPlayers(currentRoom);
                            } else {
                                rooms.delete(currentRoom);
                            }
                        }
                        
                        players.delete(currentPlayer.id);
                        
                        ws.send(JSON.stringify({
                            type: 'LEFT_ROOM'
                        }));
                    }
                    break;
                
                case 'GET_STATS':
                    ws.send(JSON.stringify({
                        type: 'STATS',
                        stats: stats
                    }));
                    break;
            }
            
        } catch (error) {
            console.error('❌ خطأ:', error);
            ws.send(JSON.stringify({
                type: 'ERROR',
                message: 'حدث خطأ في الخادم'
            }));
        }
    });
    
    ws.on('close', () => {
        console.log('🔴 اتصال مغلق');
        
        // تنظيف عند قطع الاتصال
        if (currentPlayer && currentRoom) {
            const room = rooms.get(currentRoom);
            if (room) {
                room.players = room.players.filter(p => p.id !== currentPlayer.id);
                
                if (room.players.length > 0) {
                    if (currentPlayer.isHost && room.players.length > 0) {
                        room.players[0].isHost = true;
                    }
                    updateRoomPlayers(currentRoom);
                } else {
                    rooms.delete(currentRoom);
                }
            }
            
            players.delete(currentPlayer.id);
        }
        
        stats.activePlayers = players.size;
        stats.totalRooms = rooms.size;
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`
    🚀 خادم Fruit Clash يعمل على http://localhost:${PORT}
    📊 WebSocket: ws://localhost:${PORT}
    ⏰ ${new Date().toLocaleString('ar-EG')}
    `);
});

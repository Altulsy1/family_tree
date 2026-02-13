
// game-modern.js - النسخة المتطورة والمصححة للعبة مع دعم الذكاء الاصطناعي

class ModernGame {
    constructor() {
        this.state = {
            playerId: null,
            playerName: localStorage.getItem('playerName') || 'لاعب',
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${Date.now()}`,
            isHost: false,
            roomId: null,
            players: {},
            gameData: {
                currentRound: 1,
                roundWinner: null,
                playersCards: {},
                gameActive: false,
                startTime: null,
                isSinglePlayer: false // تحديد وضع اللعب الفردي
            },
            stats: this.loadStats(),
            unsubscribeFunctions: []
        };
        
        this.timerInterval = null;
        this.aiInterval = null; // مؤقت الذكاء الاصطناعي
        this.useFirebase = true;
        this.db = null;
        this.rtdb = null;
        
        this.init();
    }
    
    // ... (باقي الدوال الموجودة تبقى كما هي حتى دالة startSinglePlayer)
    
    // ==================== نظام اللعب الفردي ضد الذكاء الاصطناعي ====================
    
    // بدء اللعب الفردي ضد الكمبيوتر
    startSinglePlayer() {
        // تحديث الحالة
        this.state.isHost = true;
        this.state.playerId = 'player_' + Date.now();
        this.state.roomId = 'AI_' + Math.random().toString(36).substring(2, 6).toUpperCase();
        this.state.gameData.isSinglePlayer = true;
        
        // إنشاء لاعبين وهميين (ذكاء اصطناعي)
        this.state.players = {
            'ai_1': {
                id: 'ai_1',
                name: 'روبوت سهل',
                avatar: 'https://api.dicebear.com/7.x/robots/svg?seed=ai1&backgroundColor=00B894&eyes=variant02',
                isHost: false,
                isAI: true,
                difficulty: 'easy',
                thinking: false
            },
            'ai_2': {
                id: 'ai_2',
                name: 'روبوت متوسط',
                avatar: 'https://api.dicebear.com/7.x/robots/svg?seed=ai2&backgroundColor=FDCB6E&eyes=variant03',
                isHost: false,
                isAI: true,
                difficulty: 'medium',
                thinking: false
            },
            'ai_3': {
                id: 'ai_3',
                name: 'روبوت متقدم',
                avatar: 'https://api.dicebear.com/7.x/robots/svg?seed=ai3&backgroundColor=FF7675&eyes=variant04',
                isHost: false,
                isAI: true,
                difficulty: 'hard',
                thinking: false
            }
        };
        
        // إخفاء عناصر غير ضرورية
        document.getElementById('side-menu')?.classList.add('hidden');
        
        // الانتقال لشاشة اللعب
        this.showScreen('game');
        this.showToast('🧠 وضع التحدي مع الذكاء الاصطناعي', 'info');
        
        // تهيئة اللعبة
        this.initializeSinglePlayerGame();
    }
    
    // تهيئة لعبة فردية
    initializeSinglePlayerGame() {
        this.state.gameData = {
            currentRound: 1,
            roundWinner: null,
            playersCards: {},
            gameActive: true,
            startTime: Date.now(),
            isSinglePlayer: true,
            aiThinking: false
        };
        
        this.dealSinglePlayerCards();
        this.startTimer(60);
        this.startAIThinking();
        this.updateGameUI();
        
        // تشغيل موسيقى البداية
        this.playSound('start');
    }
    
    // توزيع بطاقات اللعب الفردي
    dealSinglePlayerCards() {
        const fruits = ['🍎', '🍌', '🍊', '🍇', '🍓', '🍉', '🍒', '🍍'];
        const allPlayers = [this.state.playerId, 'ai_1', 'ai_2', 'ai_3'];
        
        // إنشاء 16 بطاقة (4 لكل لاعب)
        let deck = [];
        
        // نضمن وجود فرصة للفوز لكل لاعب (نوع واحد على الأقل مكرر)
        allPlayers.forEach((playerId, index) => {
            const specialFruit = fruits[index % fruits.length];
            for (let i = 0; i < 3; i++) {
                deck.push({
                    id: `card_${playerId}_${i}_${Date.now()}`,
                    emoji: specialFruit,
                    name: this.getFruitName(specialFruit),
                    fruitId: index
                });
            }
        });
        
        // إضافة البطاقات المتبقية عشوائياً
        while (deck.length < 16) {
            const fruitIndex = Math.floor(Math.random() * fruits.length);
            deck.push({
                id: `card_extra_${deck.length}_${Date.now()}`,
                emoji: fruits[fruitIndex],
                name: this.getFruitName(fruits[fruitIndex]),
                fruitId: fruitIndex
            });
        }
        
        // خلط البطاقات
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        
        // توزيع 4 بطاقات لكل لاعب
        allPlayers.forEach((playerId, index) => {
            this.state.gameData.playersCards[playerId] = deck.slice(index * 4, (index + 1) * 4);
        });
        
        // عرض بطاقات اللاعب
        this.displayMyCards(this.state.gameData.playersCards[this.state.playerId]);
        
        // عرض تقدم اللاعبين
        this.updateAIPlayersProgress();
    }
    
    // تحديث تقدم لاعبي الذكاء الاصطناعي
    updateAIPlayersProgress() {
        const progressContainer = document.getElementById('players-progress');
        if (!progressContainer) return;
        
        progressContainer.innerHTML = '';
        
        // إضافة اللاعب الحقيقي أولاً
        this.addPlayerProgress(progressContainer, {
            id: this.state.playerId,
            name: this.state.playerName,
            avatar: this.state.avatar,
            cards: this.state.gameData.playersCards[this.state.playerId] || []
        }, true);
        
        // إضافة لاعبي الذكاء الاصطناعي
        Object.values(this.state.players).forEach(player => {
            if (player.isAI) {
                this.addPlayerProgress(progressContainer, {
                    id: player.id,
                    name: player.name,
                    avatar: player.avatar,
                    cards: this.state.gameData.playersCards[player.id] || []
                }, false, player.difficulty);
            }
        });
    }
    
    // إضافة عنصر تقدم لاعب
    addPlayerProgress(container, player, isHuman, difficulty = '') {
        const cardCount = player.cards?.length || 4;
        const progress = (4 - cardCount) * 25; // كل بطاقة مفقودة = 25% تقدم
        
        const div = document.createElement('div');
        div.className = `player-progress-item ${this.state.gameData.roundWinner === player.id ? 'winner' : ''}`;
        div.dataset.playerId = player.id;
        
        // تحديد أيقونة حسب الحالة
        const aiThinking = this.state.players[player.id]?.thinking ? 'ai-thinking' : '';
        
        div.innerHTML = `
            <div class="player-mini-avatar ${aiThinking}">
                <img src="${player.avatar}" alt="" onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=${player.id}'">
                ${isHuman ? '<i class="fas fa-user"></i>' : '<i class="fas fa-microchip"></i>'}
            </div>
            <div class="player-mini-info">
                <div class="player-mini-name">${player.name}</div>
                <div class="player-mini-cards">${cardCount}/4</div>
            </div>
            <div class="progress-bar" style="width: ${progress}%"></div>
            ${difficulty ? `<span class="difficulty-badge ${difficulty}">${
                difficulty === 'easy' ? 'سهل' : 
                difficulty === 'hard' ? 'متقدم' : 'متوسط'
            }</span>` : ''}
        `;
        
        container.appendChild(div);
    }
    
    // بدء تفكير الذكاء الاصطناعي
    startAIThinking() {
        if (this.aiInterval) clearInterval(this.aiInterval);
        
        this.aiInterval = setInterval(() => {
            if (!this.state.gameData.gameActive || this.state.gameData.roundWinner) return;
            
            // كل لاعب AI يفكر بشكل مستقل
            Object.keys(this.state.players).forEach(aiId => {
                if (this.state.players[aiId]?.isAI) {
                    this.makeAIMove(aiId);
                }
            });
        }, 1500); // كل 1.5 ثانية
    }
    
    // تنفيذ حركة الذكاء الاصطناعي
    makeAIMove(aiId) {
        if (!this.state.gameData.playersCards[aiId]) return;
        
        const aiCards = this.state.gameData.playersCards[aiId];
        const difficulty = this.state.players[aiId]?.difficulty || 'medium';
        
        // إظهار تأثير التفكير
        this.state.players[aiId].thinking = true;
        this.updateAIPlayersProgress();
        
        setTimeout(() => {
            if (this.state.players[aiId]) {
                this.state.players[aiId].thinking = false;
                this.updateAIPlayersProgress();
            }
        }, 800);
        
        // حساب عدد البطاقات المتطابقة
        const counts = {};
        aiCards.forEach(card => {
            counts[card.emoji] = (counts[card.emoji] || 0) + 1;
        });
        
        const maxCount = Math.max(...Object.values(counts));
        const hasFour = maxCount >= 4;
        
        // احتمالية إعلان الفوز حسب الصعوبة
        let winChance = 0;
        switch(difficulty) {
            case 'easy':
                winChance = hasFour ? 0.2 : 0; // 20% إذا كان عنده 4
                break;
            case 'medium':
                winChance = hasFour ? 0.6 : (maxCount >= 3 ? 0.1 : 0); // 60% إذا 4، 10% إذا 3
                break;
            case 'hard':
                winChance = hasFour ? 1 : (maxCount >= 3 ? 0.5 : 0); // أكيد إذا 4، 50% إذا 3
                break;
        }
        
        // قرار الفوز
        if (Math.random() < winChance) {
            setTimeout(() => {
                this.aiWinRound(aiId);
            }, Math.random() * 1000 + 300);
        }
        
        // في الوضع الصعب، قد يحاول اللعب تكتيكياً
        if (difficulty === 'hard' && !hasFour && maxCount >= 2) {
            this.showToast(`${this.state.players[aiId].name} يفكر...`, 'info');
        }
    }
    
    // فوز الذكاء الاصطناعي
    aiWinRound(aiId) {
        if (this.state.gameData.roundWinner) return;
        
        const aiPlayer = this.state.players[aiId];
        if (!aiPlayer) return;
        
        this.state.gameData.roundWinner = aiId;
        this.state.gameData.gameActive = false;
        
        const winTime = Math.floor((Date.now() - this.state.gameData.startTime) / 1000);
        
        this.showWinner(aiId, winTime);
        this.showToast(`🤖 ${aiPlayer.name} فاز بالجولة!`, 'warning');
        
        // تحديث الواجهة
        this.updateAIPlayersProgress();
        
        // إيقاف تفكير الذكاء الاصطناعي مؤقتاً
        if (this.aiInterval) {
            clearInterval(this.aiInterval);
            this.aiInterval = null;
        }
    }
    
    // تجاوز دالة الفوز للتعامل مع الذكاء الاصطناعي
    pressWinButton() {
        if (this.state.gameData.roundWinner || !this.state.gameData.gameActive) return;
        
        // التحقق من أن اللاعب لديه 4 بطاقات متطابقة
        const myCards = this.state.gameData.playersCards[this.state.playerId];
        if (!myCards) return;
        
        const counts = {};
        myCards.forEach(card => {
            counts[card.emoji] = (counts[card.emoji] || 0) + 1;
        });
        
        const hasFour = Object.values(counts).some(count => count >= 4);
        
        if (!hasFour) {
            this.showToast('⚠️ ليس لديك 4 بطاقات متطابقة!', 'error');
            return;
        }
        
        this.triggerHaptic('heavy');
        this.launchConfetti();
        
        // فوز اللاعب الحقيقي
        this.handleWin(this.state.playerId);
        
        // إيقاف الذكاء الاصطناعي
        if (this.aiInterval) {
            clearInterval(this.aiInterval);
            this.aiInterval = null;
        }
    }
    
    // تعديل دالة showWinner لدعم الذكاء الاصطناعي
    showWinner(playerId, time) {
        let winnerName = '';
        let winnerAvatar = '';
        
        if (playerId === this.state.playerId) {
            winnerName = this.state.playerName;
            winnerAvatar = this.state.avatar;
        } else if (this.state.players[playerId]) {
            winnerName = this.state.players[playerId].name;
            winnerAvatar = this.state.players[playerId].avatar;
        } else {
            winnerName = 'الخصم';
            winnerAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${playerId}`;
        }
        
        document.getElementById('winner-avatar').innerHTML = `<img src="${winnerAvatar}" alt="">`;
        document.getElementById('result-title').textContent = `🎉 ${winnerName} فاز!`;
        document.getElementById('result-message').textContent = `جمع 4 بطاقات في ${time} ثانية`;
        document.getElementById('round-time').textContent = `${time}s`;
        document.getElementById('win-streak').textContent = this.state.stats.winStreak || 0;
        document.getElementById('result-modal').classList.remove('hidden');
        
        // تغيير نص زر الجولة التالية حسب الوضع
        const nextRoundBtn = document.getElementById('next-round-btn');
        const endGameBtn = document.getElementById('end-game-btn');
        
        if (this.state.gameData.isSinglePlayer) {
            // وضع اللعب الفردي
            nextRoundBtn.innerHTML = '<i class="fas fa-redo-alt"></i> جولة جديدة';
            nextRoundBtn.onclick = () => {
                document.getElementById('result-modal').classList.add('hidden');
                this.resetSinglePlayerGame();
            };
            
            endGameBtn.innerHTML = '<i class="fas fa-home"></i> القائمة';
            endGameBtn.onclick = () => {
                document.getElementById('result-modal').classList.add('hidden');
                this.endSinglePlayerGame();
            };
        } else {
            // وضع اللعب الجماعي
            nextRoundBtn.innerHTML = '<i class="fas fa-redo-alt"></i> الجولة التالية';
            nextRoundBtn.onclick = () => {
                document.getElementById('result-modal').classList.add('hidden');
                this.initializeRound();
            };
            
            endGameBtn.innerHTML = '<i class="fas fa-home"></i> القائمة الرئيسية';
            endGameBtn.onclick = () => {
                document.getElementById('result-modal').classList.add('hidden');
                this.showScreen('main-menu');
            };
        }
        
        this.launchConfetti();
        
        if (playerId === this.state.playerId) {
            this.triggerHaptic('success');
        }
    }
    
    // إعادة ضبط للعب الفردي
    resetSinglePlayerGame() {
        this.state.gameData.currentRound++;
        this.state.gameData.roundWinner = null;
        this.state.gameData.gameActive = true;
        this.state.gameData.startTime = Date.now();
        
        // إعادة توزيع البطاقات
        this.dealSinglePlayerCards();
        this.startTimer(60);
        this.startAIThinking();
        
        this.updateAIPlayersProgress();
        this.updateGameUI();
        
        this.showToast(`🔄 جولة جديدة - الجولة ${this.state.gameData.currentRound}`, 'info');
    }
    
    // إنهاء لعبة فردية
    endSinglePlayerGame() {
        if (this.aiInterval) {
            clearInterval(this.aiInterval);
            this.aiInterval = null;
        }
        
        // إعادة تعيين حالة اللعبة
        this.state.gameData.isSinglePlayer = false;
        this.state.players = {};
        
        this.showScreen('main-menu');
        this.showToast('👋 انتهت اللعبة', 'info');
    }
    
    // تعديل دالة stopTimer لتنظيف الذكاء الاصطناعي
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // في حالة نهاية اللعبة، نظف الذكاء الاصطناعي
        if (this.state.gameData?.isSinglePlayer && !this.state.gameData?.gameActive) {
            if (this.aiInterval) {
                clearInterval(this.aiInterval);
                this.aiInterval = null;
            }
        }
    }
    
    // ==================== نهاية نظام اللعب الفردي ====================
    
    // باقي دوال اللعبة (كما هي موجودة) ...
    
    // تعديل دالة الخروج من اللعبة
    async leaveRoom() {
        // تنظيف الذكاء الاصطناعي إذا كان في وضع اللعب الفردي
        if (this.aiInterval) {
            clearInterval(this.aiInterval);
            this.aiInterval = null;
        }
        
        if (this.useFirebase && this.db && this.state.roomId) {
            try {
                await this.db.collection('rooms').doc(this.state.roomId).update({
                    [`players.${this.state.playerId}`]: firebase.firestore.FieldValue.delete(),
                    playerCount: firebase.firestore.FieldValue.increment(-1)
                });
                
                this.state.unsubscribeFunctions.forEach(unsub => {
                    if (typeof unsub === 'function') unsub();
                });
                
            } catch (error) {
                console.error('خطأ في الخروج:', error);
            }
        }
        
        this.showScreen('main-menu');
        this.showToast('تم الخروج', 'info');
    }
}

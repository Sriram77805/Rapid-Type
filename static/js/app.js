// static/js/app.js
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const textToTypeElement = document.getElementById('text-to-type');
    const userInputElement = document.getElementById('user-input');
    const timerDisplay = document.getElementById('timer-display');
    const testArea = document.getElementById('test-area');
    const resultsArea = document.getElementById('results-area');
    
    // Results Elements
    const finalWpmElement = document.getElementById('final-wpm');
    const finalAccuracyElement = document.getElementById('final-accuracy');
    const statTestType = document.getElementById('stat-test-type');
    const statRawWpm = document.getElementById('stat-raw-wpm');
    const statChars = document.getElementById('stat-chars');
    const statConsistency = document.getElementById('stat-consistency');
    const statTime = document.getElementById('stat-time');
    const statsChartCanvas = document.getElementById('statsChart');

    // Controls
    const resetButton = document.getElementById('reset-btn');
    const nextTestButton = document.getElementById('next-test-btn');
    const configBar = document.getElementById('config-bar');
    const countOptions = document.getElementById('count-options');

    // --- State Variables ---
    let mainTimer;
    let intervalTimer;
    let timeLeft = 30;
    let testActive = false;
    let sourceText = '';
    let chartInstance;
    
    // Stat tracking arrays
    let wpmHistory = [];
    let rawWpmHistory = [];
    let errorHistory = [];

    let config = {
        punctuation: false,
        numbers: false,
        mode: 'time',
        count: 30
    };

    // --- Core Functions ---
    const startNewTest = async () => {
        // Reset state and UI
        clearInterval(mainTimer);
        clearInterval(intervalTimer);
        testActive = false;
        if (chartInstance) chartInstance.destroy();

        wpmHistory = [];
        rawWpmHistory = [];
        errorHistory = [];
        
        resultsArea.style.display = 'none';
        testArea.style.display = 'block';
        userInputElement.value = '';
        userInputElement.disabled = true;
        textToTypeElement.scrollTop = 0;
        
        textToTypeElement.innerHTML = '<span class="untyped">Loading...</span>';
        
        // Fetch new text from API
        const query = new URLSearchParams(config).toString();
        const response = await fetch(`/api/get_text?${query}`);
        const data = await response.json();
        sourceText = data.text;
        
        // Populate text area
        textToTypeElement.innerHTML = '';
        sourceText.split('').forEach(char => {
            const charSpan = document.createElement('span');
            charSpan.innerText = char;
            textToTypeElement.appendChild(charSpan);
        });
        
        textToTypeElement.querySelector('span').classList.add('cursor');
        updateTimerDisplay();
        userInputElement.disabled = false;
        userInputElement.focus();
    };

    const updateTimerDisplay = () => {
        if (config.mode === 'time') {
            timeLeft = config.count;
            timerDisplay.textContent = timeLeft;
        } else {
            timeLeft = 0;
            timerDisplay.textContent = `${userInputElement.value.split(' ').length -1} / ${config.count}`;
        }
    };

    const startTimers = () => {
        if (testActive) return;
        testActive = true;
        
        const testStartTime = Date.now();

        if (config.mode === 'time') {
            mainTimer = setInterval(() => {
                timeLeft--;
                timerDisplay.textContent = timeLeft;
                if (timeLeft <= 0) endTest();
            }, 1000);
        } else {
             mainTimer = setInterval(() => {
                timeLeft++;
            }, 1000);
        }

        intervalTimer = setInterval(() => {
            recordLiveStats(testStartTime);
        }, 1000);
    };

    const handleTyping = () => {
        if (!testActive) startTimers();
        
        const userChars = userInputElement.value.split('');
        const sourceSpans = textToTypeElement.querySelectorAll('span');
        
        // Remove cursor from all spans
        sourceSpans.forEach(span => span.classList.remove('cursor'));

        // Compare typed text with source text
        let correctCharsCount = 0;
        sourceSpans.forEach((charSpan, index) => {
            const userChar = userChars[index];
            if (userChar == null) {
                charSpan.className = 'untyped';
            } else if (userChar === charSpan.innerText) {
                charSpan.className = 'correct';
                correctCharsCount++;
            } else {
                charSpan.className = 'incorrect';
            }
        });
        
        // Add cursor to the next character to be typed
        if (userChars.length < sourceSpans.length) {
            sourceSpans[userChars.length].classList.add('cursor');
        }

        scrollToCursor();

        // End test for 'words' mode
        if (config.mode === 'words') {
             const typedWords = userInputElement.value.trim().split(/\s+/).length;
             timerDisplay.textContent = `${typedWords} / ${config.count}`;
            if (correctCharsCount === sourceText.length) {
                 endTest();
            }
        }
    };

    const recordLiveStats = (startTime) => {
        const timeElapsed = (Date.now() - startTime) / 1000;
        if (timeElapsed === 0) return;

        const typedChars = userInputElement.value.length;
        const correctChars = textToTypeElement.querySelectorAll('.correct').length;
        const errors = typedChars - correctChars;
        
        const currentRawWpm = (typedChars / 5) / (timeElapsed / 60);
        const currentWpm = (correctChars / 5) / (timeElapsed / 60);
        
        rawWpmHistory.push(Math.round(currentRawWpm));
        wpmHistory.push(Math.round(currentWpm));
        errorHistory.push(errors);
    };
    
    const endTest = () => {
        clearInterval(mainTimer);
        clearInterval(intervalTimer);
        testActive = false;
        userInputElement.disabled = true;
        testArea.style.display = 'none';

        // --- Final Calculations ---
        const timeElapsed = config.mode === 'time' ? config.count : timeLeft;
        const typedChars = userInputElement.value.length;
        const correctSpans = textToTypeElement.querySelectorAll('.correct');
        const incorrectSpans = textToTypeElement.querySelectorAll('.incorrect');
        
        const correctChars = correctSpans.length;
        const incorrectChars = incorrectSpans.length;

        const accuracy = typedChars > 0 ? (correctChars / (correctChars + incorrectChars)) * 100 : 0;
        const wpm = timeElapsed > 0 ? (correctChars / 5) / (timeElapsed / 60) : 0;
        const rawWpm = timeElapsed > 0 ? (typedChars / 5) / (timeElapsed / 60) : 0;
        
        // --- Display Final Stats ---
        finalWpmElement.textContent = Math.round(wpm);
        finalAccuracyElement.textContent = `${Math.round(accuracy)}%`;
        
        statTestType.textContent = `${config.mode} ${config.count}`;
        statRawWpm.textContent = Math.round(rawWpm);
        statChars.textContent = `${correctChars}/${incorrectChars}/${typedChars - (correctChars + incorrectChars)}`;
        statTime.textContent = `${timeElapsed}s`;

        // Calculate and display consistency
        const meanWpm = wpmHistory.reduce((a, b) => a + b, 0) / wpmHistory.length || 0;
        const stdDev = Math.sqrt(wpmHistory.map(x => Math.pow(x - meanWpm, 2)).reduce((a, b) => a + b, 0) / wpmHistory.length) || 0;
        const consistency = meanWpm > 0 ? Math.max(0, (1 - (stdDev / meanWpm)) * 100) : 0;
        statConsistency.textContent = `${Math.round(consistency)}%`;
        
        resultsArea.style.display = 'block';
        renderChart();

        // --- Save Result if Logged In ---
        if (document.body.dataset.isAuthenticated === 'true') {
            fetch('/api/save_result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wpm: Math.round(wpm), accuracy: Math.round(accuracy) })
            });
        }
    };

    const renderChart = () => {
        const labels = Array.from({ length: wpmHistory.length }, (_, i) => i + 1);
        const ctx = statsChartCanvas.getContext('2d');
        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'wpm',
                        data: wpmHistory,
                        borderColor: '#007BFF', // Accent color
                        backgroundColor: 'rgba(0, 123, 255, 0.1)',
                        fill: true,
                        tension: 0.3,
                        yAxisID: 'y'
                    },
                    {
                        label: 'raw',
                        data: rawWpmHistory,
                        borderColor: '#6C757D', // Sub color
                        borderDash: [5, 5],
                        tension: 0.3,
                        yAxisID: 'y'
                    },
                     {
                        label: 'errors',
                        data: errorHistory,
                        borderColor: '#DC3545', // Incorrect color
                        backgroundColor: 'rgba(220, 53, 69, 0.2)',
                        stepped: true,
                        pointStyle: 'crossRot',
                        radius: 5,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                scales: {
                    x: { grid: { color: 'rgba(0, 0, 0, 0.05)' } },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true,
                        grid: { color: 'rgba(0, 0, 0, 0.1)' },
                        title: { display: true, text: 'WPM' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true,
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: 'Errors' },
                        ticks: { stepSize: 1 }
                    }
                },
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    const scrollToCursor = () => {
        const cursor = textToTypeElement.querySelector('.cursor');
        if (cursor) {
            const boxRect = textToTypeElement.getBoundingClientRect();
            const cursorRect = cursor.getBoundingClientRect();
            // Scroll down if cursor is past the halfway point of the box
            if (cursorRect.bottom > boxRect.top + textToTypeElement.clientHeight) {
                textToTypeElement.scrollTop += cursor.offsetHeight * 1.5;
            }
        }
    };
    
    // --- Event Listeners ---
    configBar.addEventListener('click', (e) => {
        if (e.target.matches('.btn-config')) {
            const key = e.target.dataset.config;
            const value = e.target.dataset.value;
            
            if (key === 'punctuation' || key === 'numbers') {
                config[key] = !config[key];
                e.target.classList.toggle('active');
            } else {
                config[key] = isNaN(value) ? value : parseInt(value);
                // Update active buttons in the same group
                e.target.parentElement.querySelectorAll('.btn-config').forEach(btn => btn.classList.remove('active'));
                e.target.classList.add('active');
            }

            // Show/hide word count options based on mode
            countOptions.style.display = config.mode === 'words' ? 'none' : 'flex';
            if(config.mode === 'words') config.count = 30; // default for words mode
            
            startNewTest();
        }
    });

    userInputElement.addEventListener('input', handleTyping);
    resetButton.addEventListener('click', startNewTest);
    nextTestButton.addEventListener('click', startNewTest);

    // --- Initial Load ---
    startNewTest();
});
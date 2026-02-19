// DOM Elements
const app = {
    screens: {
        setup: document.getElementById('setup-screen'),
        game: document.getElementById('game-screen')
    },
    upload: {
        input: document.getElementById('image-upload'),
        zone: document.getElementById('drop-zone'),
        preview: document.getElementById('preview-image'),
        placeholder: document.querySelector('.upload-placeholder')
    },
    buttons: {
        difficulty: document.querySelectorAll('.diff-btn'),
        start: document.getElementById('start-btn'),
        back: document.getElementById('back-btn'),
        hint: document.getElementById('hint-btn'),
        playAgain: document.getElementById('play-again-btn')
    },
    canvas: document.getElementById('puzzle-canvas'),
    container: document.getElementById('canvas-container'),
    timer: document.getElementById('timer'),
    modal: document.getElementById('completion-modal')
};

// State
let state = {
    image: null,
    targetPieceCount: 12,
    pieces: [],
    groups: [], // Array of arrays of piece indices
    canvasScale: 1,
    cols: 3,
    rows: 4,
    pieceWidth: 0,
    pieceHeight: 0,
    boardRect: { x: 0, y: 0, w: 0, h: 0 },
    draggingGroup: null,
    dragOffset: { x: 0, y: 0 },
    startTime: 0,
    timerInterval: null,
    isComplete: false,
    // Viewport (zoom & pan)
    viewX: 0,
    viewY: 0,
    viewZoom: 1,
    isPanning: false,
    panAnchor: { x: 0, y: 0 },
    panStart: { x: 0, y: 0 },
    // Assist mode
    assistMode: false
};

const STYLE = {
    trayColor: '#2c3e50',
    boardColor: '#ecf0f1',
    frameColor: '#8e44ad',
    frameWidth: 10,
    strokeColor: '#000',
    strokeWidth: 2
};

// Colors for debug or backgrounds
const STROKE_COLOR = '#000';
const STROKE_WIDTH = 2;

// Event Listeners (Setup)
function initControls() {
    // Upload Handling
    app.upload.zone.addEventListener('click', () => app.upload.input.click());
    app.upload.input.addEventListener('change', handleFileSelect);

    // Drag and Drop for Upload
    app.upload.zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        app.upload.zone.classList.add('dragover');
    });
    app.upload.zone.addEventListener('dragleave', () => {
        app.upload.zone.classList.remove('dragover');
    });
    app.upload.zone.addEventListener('drop', (e) => {
        e.preventDefault();
        app.upload.zone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    // Sample Image
    const sampleBtn = document.getElementById('sample-btn');
    if (sampleBtn) {
        sampleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log('Sample button clicked');
            const img = new Image();
            img.onload = () => {
                console.log('Sample image loaded');
                state.image = img;
                app.upload.preview.src = img.src;
                app.upload.preview.hidden = false;
                app.upload.placeholder.hidden = true;
                updateStartButton();
            };
            img.onerror = (err) => {
                console.error('Failed to load sample image', err);
                alert('サンプル画像の読み込みに失敗しました。');
            };
            img.src = 'sample.png';
        });
    }

    // Difficulty Selection
    app.buttons.difficulty.forEach(btn => {
        btn.addEventListener('click', () => {
            app.buttons.difficulty.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            state.targetPieceCount = parseInt(btn.dataset.pieces);
            updateStartButton();
        });
    });

    // Navigation
    app.buttons.start.addEventListener('click', startGame);
    app.buttons.back.addEventListener('click', () => {
        stopTimer();
        switchScreen('setup');
    });
    app.buttons.playAgain.addEventListener('click', () => {
        app.modal.hidden = true;
        state.isComplete = false;
        switchScreen('setup');
    });

    // View Completed Puzzle
    const viewCompletedBtn = document.getElementById('view-completed-btn');
    const backFromViewBtn = document.getElementById('back-from-view-btn');
    const backFromViewWrap = document.getElementById('back-from-view-wrap');

    if (viewCompletedBtn) {
        viewCompletedBtn.addEventListener('click', () => {
            // Hide the modal to show the completed puzzle
            app.modal.hidden = true;
            // Hide toolbar
            document.querySelector('.toolbar').style.display = 'none';
            // Show back button wrapper below canvas
            if (backFromViewWrap) backFromViewWrap.style.display = 'block';
            // Show praise for easy/recommended modes
            const praiseEl = document.getElementById('praise-message');
            if (praiseEl) {
                const isEasyMode = state.targetPieceCount <= 56;
                praiseEl.style.display = isEasyMode ? 'block' : 'none';
            }
            // Redraw to clear confetti
            draw();
        });
    }

    if (backFromViewBtn) {
        backFromViewBtn.addEventListener('click', () => {
            // Go back to setup screen
            state.isComplete = false;
            document.querySelector('.toolbar').style.display = '';
            if (backFromViewWrap) backFromViewWrap.style.display = 'none';
            // Hide praise
            const praiseEl = document.getElementById('praise-message');
            if (praiseEl) praiseEl.style.display = 'none';
            switchScreen('setup');
        });
    }

    // Hint / Guide Toggle
    app.buttons.hint.addEventListener('click', () => {
        state.showGuide = !state.showGuide;
        draw();
    });

    // Assist Mode Toggle
    const assistBtn = document.getElementById('assist-btn');
    if (assistBtn) {
        assistBtn.addEventListener('click', () => {
            state.assistMode = !state.assistMode;
            assistBtn.classList.toggle('active', state.assistMode);
            draw();
        });
    }

    // Zoom Controls
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');

    function applyZoom(newZoom) {
        const oldZoom = state.viewZoom;
        newZoom = Math.max(0.5, Math.min(3.0, newZoom));
        if (newZoom === oldZoom) return;

        // Zoom centered on canvas midpoint
        const cx = app.canvas.width / 2;
        const cy = app.canvas.height / 2;
        state.viewX = cx - (cx - state.viewX) * (newZoom / oldZoom);
        state.viewY = cy - (cy - state.viewY) * (newZoom / oldZoom);
        state.viewZoom = newZoom;
        updateZoomLabel();
        draw();
    }

    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => applyZoom(state.viewZoom + 0.5));
    }
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            applyZoom(state.viewZoom - 0.5);
            // If back to 1x, reset pan too
            if (state.viewZoom <= 1) {
                resetView();
                draw();
            }
        });
    }

    // Resize
    window.addEventListener('resize', () => {
        if (!app.screens.game.hidden) resizeCanvas();
    });

    // Prevent right-click / long-press context menu
    app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.getElementById('game-screen').addEventListener('contextmenu', (e) => e.preventDefault());

    // Canvas Interaction
    app.canvas.addEventListener('pointerdown', onPointerDown);
    app.canvas.addEventListener('pointermove', onPointerMove);
    app.canvas.addEventListener('pointerup', onPointerUp);
    // Prevent default touch actions usually
    app.canvas.style.touchAction = 'none';
}

function updateStartButton() {
    app.buttons.start.disabled = !(state.image && state.targetPieceCount);
}

function handleFileSelect(e) {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
    }
}

function handleFile(file) {
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            state.image = img;
            app.upload.preview.src = img.src;
            app.upload.preview.hidden = false;
            app.upload.placeholder.hidden = true;
            updateStartButton();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function switchScreen(screenName) {
    Object.values(app.screens).forEach(s => s.classList.remove('active'));
    app.screens[screenName].classList.add('active');
    // Scroll prevention on mobile
    if (screenName === 'game') {
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
    }
}

// Coordinate conversion: screen -> world (accounting for zoom/pan)
function screenToWorld(sx, sy) {
    return {
        x: (sx - state.viewX) / state.viewZoom,
        y: (sy - state.viewY) / state.viewZoom
    };
}

function resetView() {
    state.viewX = 0;
    state.viewY = 0;
    state.viewZoom = 1;
    updateZoomLabel();
}

function updateZoomLabel() {
    const el = document.getElementById('zoom-level');
    if (el) el.textContent = Math.round(state.viewZoom * 100) + '%';
}

// Game Logic
function startGame() {
    if (!state.image) return;
    resetView();
    switchScreen('game');

    state.showGuide = false; // Reset guide

    // Defer initialization to allow layout to settle
    requestAnimationFrame(() => {
        resizeCanvas();
        generatePuzzle();
        startTimer();
    });
}

function resizeCanvas() {
    // Make canvas fit the container
    const rect = app.container.getBoundingClientRect();
    app.canvas.width = rect.width;
    app.canvas.height = rect.height;
    draw();
}

function startTimer() {
    state.startTime = Date.now();
    state.isComplete = false;
    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
        const delta = Math.floor((Date.now() - state.startTime) / 1000);
        const m = Math.floor(delta / 60).toString().padStart(2, '0');
        const s = (delta % 60).toString().padStart(2, '0');
        app.timer.textContent = `${m}:${s}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(state.timerInterval);
}

function generatePuzzle() {
    // 1. Calculate Grid
    const imgRatio = state.image.width / state.image.height;
    // Area = w * h. pieces = rows * cols. ratio = w/h = cols/rows.
    // pieces = (ratio * rows) * rows = ratio * rows^2.
    // rows = sqrt(pieces / ratio)

    const count = state.targetPieceCount;
    let rows = Math.round(Math.sqrt(count / imgRatio));
    let cols = Math.round(rows * imgRatio);

    // Safety for small counts
    if (rows < 1) rows = 1;
    if (cols < 2) cols = 2;

    state.rows = rows;
    state.cols = cols;
    state.pieceWidth = state.image.width / cols;
    state.pieceHeight = state.image.height / rows;

    // 2. Clear state
    state.pieces = [];
    state.groups = [];

    // 3. Generate Pieces
    // We need to define edges. 
    // Vertical edges: rows x (cols-1)
    // Horizontal edges: (rows-1) x cols
    // 1 = tab (out), -1 = slot (in), 0 = flat (border)

    // A piece at r,c has:
    // Top: if r=0 flat, else match (r-1,c) Bottom * -1
    // Right: random if c<cols-1, else flat
    // Bottom: random if r<rows-1, else flat
    // Left: if c=0 flat, else match (r,c-1) Right * -1

    // Define the full grid of edges first to ensure consistency? 
    // Easier to generate piece by piece in order.

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const piece = {
                id: r * cols + c,
                r, c,
                x: 0, y: 0, // Current position (canvas coords)
                targetX: 0, targetY: 0, // Target position relative to "assembled puzzle origin" 
                width: state.pieceWidth,
                height: state.pieceHeight,
                shapes: {
                    top: (r === 0) ? 0 : -state.pieces[(r - 1) * cols + c].shapes.bottom,
                    right: (c === cols - 1) ? 0 : (Math.random() > 0.5 ? 1 : -1),
                    bottom: (r === rows - 1) ? 0 : (Math.random() > 0.5 ? 1 : -1),
                    left: (c === 0) ? 0 : -state.pieces[r * cols + (c - 1)].shapes.right
                }
            };
            state.pieces.push(piece);
            state.groups.push([piece.id]); // Each piece starts in its own group
        }
    }

    // 4. Calculate Board & Scatter
    const puzzleScreenRatio = 0.6;
    const puzzleWidth = state.pieceWidth * cols;
    const puzzleHeight = state.pieceHeight * rows;

    const scaleX = (app.canvas.width * puzzleScreenRatio) / puzzleWidth;
    const scaleY = (app.canvas.height * puzzleScreenRatio) / puzzleHeight;
    state.canvasScale = Math.min(scaleX, scaleY);

    const scaledPW = state.pieceWidth * state.canvasScale;
    const scaledPH = state.pieceHeight * state.canvasScale;

    const totalW = scaledPW * cols;
    const totalH = scaledPH * rows;

    state.boardRect = {
        x: (app.canvas.width - totalW) / 2,
        y: (app.canvas.height - totalH) / 2,
        w: totalW,
        h: totalH
    };

    scatterPieces(false);

    draw();
}

function scatterPieces(keepLocked = false) {
    const puzzleScreenRatio = 0.6; // We need this or recalculate? 
    // Actually state.canvasScale and boardRect are already set in generatePuzzle.
    // We can rely on state properties.

    // Recalculate margins based on current state.boardRect
    if (state.boardRect.w === 0) return;

    // Use scaled sizes
    const scaledPW = state.pieceWidth * state.canvasScale;
    const scaledPH = state.pieceHeight * state.canvasScale;

    // Calculate margins
    const marginL = state.boardRect.x;
    const marginR = app.canvas.width - (state.boardRect.x + state.boardRect.w);
    const marginT = state.boardRect.y;
    const marginB = app.canvas.height - (state.boardRect.y + state.boardRect.h);

    state.pieces.forEach(p => {
        // If keepLocked is true and piece is locked, skip
        if (keepLocked && p.isLocked) return;

        // Reset lock if we are moving it
        p.isLocked = false;

        // Try to place in margins.
        const sides = [];
        if (marginT > scaledPH * 0.5) sides.push('top');
        if (marginB > scaledPH * 0.5) sides.push('bottom');
        if (marginL > scaledPW * 0.5) sides.push('left');
        if (marginR > scaledPW * 0.5) sides.push('right');

        if (sides.length === 0) sides.push('any');

        const side = sides[Math.floor(Math.random() * sides.length)];
        let px, py;
        const pad = 10;

        switch (side) {
            case 'top':
                px = Math.random() * (app.canvas.width - scaledPW);
                py = Math.random() * (state.boardRect.y - scaledPH - pad);
                break;
            case 'bottom':
                px = Math.random() * (app.canvas.width - scaledPW);
                py = (state.boardRect.y + state.boardRect.h + pad) + Math.random() * (app.canvas.height - (state.boardRect.y + state.boardRect.h + pad) - scaledPH);
                break;
            case 'left':
                px = Math.random() * (state.boardRect.x - scaledPW - pad);
                py = Math.random() * (app.canvas.height - scaledPH);
                break;
            case 'right':
                px = (state.boardRect.x + state.boardRect.w + pad) + Math.random() * (app.canvas.width - (state.boardRect.x + state.boardRect.w + pad) - scaledPW);
                py = Math.random() * (app.canvas.height - scaledPH);
                break;
            default:
                px = Math.random() * (app.canvas.width - scaledPW);
                py = Math.random() * (app.canvas.height - scaledPH);
                break;
        }

        p.x = px;
        p.y = py;
    });


    // -------------------------------------------------------------
    // Rendering & Math
    // -------------------------------------------------------------

    draw();
}

// -------------------------------------------------------------
// Rendering & Math
// -------------------------------------------------------------

function draw() {
    const ctx = app.canvas.getContext('2d');

    // Draw Tray Background (always full canvas, before zoom transform)
    ctx.fillStyle = STYLE.trayColor;
    ctx.fillRect(0, 0, app.canvas.width, app.canvas.height);

    // Apply viewport transform
    ctx.save();
    ctx.translate(state.viewX, state.viewY);
    ctx.scale(state.viewZoom, state.viewZoom);

    // Draw Board (Frame)
    if (state.image && state.boardRect.w > 0) {
        const br = state.boardRect;

        // Shadow
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 10;
        ctx.shadowOffsetY = 10;

        // Frame
        ctx.fillStyle = STYLE.frameColor;
        ctx.fillRect(br.x - STYLE.frameWidth, br.y - STYLE.frameWidth, br.w + STYLE.frameWidth * 2, br.h + STYLE.frameWidth * 2);

        // Board surface
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = STYLE.boardColor;
        ctx.fillRect(br.x, br.y, br.w, br.h);

        // Draw Guide (Ghost image)
        if (state.showGuide) {
            ctx.globalAlpha = 0.2;
            ctx.drawImage(state.image, br.x, br.y, br.w, br.h);
            ctx.globalAlpha = 1.0;
        }
    }

    // Assist mode highlight: draw target slots for dragged pieces
    if (state.assistMode && state.draggingGroup && state.image) {
        const scale = state.canvasScale;
        const br = state.boardRect;
        const pulseAlpha = 0.25 + 0.15 * Math.sin(Date.now() / 200);
        state.draggingGroup.forEach(id => {
            const p = getPiece(id);
            if (p.isLocked) return;
            const targetX = br.x + p.c * p.width * scale;
            const targetY = br.y + p.r * p.height * scale;
            const w = p.width * scale;
            const h = p.height * scale;
            ctx.save();
            createPiecePath(ctx, targetX, targetY, w, h, p.shapes);
            ctx.fillStyle = 'rgba(46, 204, 113, ' + pulseAlpha + ')';
            ctx.shadowColor = '#2ecc71';
            ctx.shadowBlur = 25;
            ctx.fill();
            ctx.strokeStyle = 'rgba(46, 204, 113, 0.8)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        });
        // Keep pulsing animation
        requestAnimationFrame(() => { if (state.draggingGroup) draw(); });
    }

    // Sort pieces: non-dragging first, dragging last (so it floats above)
    const sortedPieces = [...state.pieces].sort((a, b) => {
        const groupA = getGroup(a.id);
        const groupB = getGroup(b.id);
        if (groupA === state.draggingGroup) return 1;
        if (groupB === state.draggingGroup) return -1;
        return 0;
    });

    sortedPieces.forEach(p => drawPiece(ctx, p));

    // Restore viewport transform
    ctx.restore();
}

function drawPiece(ctx, p) {
    const scale = state.canvasScale;
    const w = p.width * scale;
    const h = p.height * scale;
    const x = p.x;
    const y = p.y;

    ctx.save();

    // Create the path for the puzzle piece shape
    createPiecePath(ctx, x, y, w, h, p.shapes);

    ctx.clip();

    // Draw the image segment
    // Source: (p.c * p.width, p.r * p.height, p.width, p.height)
    // Destination: (x, y, w, h) -- needs adjustment for tabs!
    // The "box" (x,y,w,h) is the bounding box of the grid cell. 
    // The tabs stick OUT of this box.
    // So we need to fetch a slightly larger chunk of the image, or just draw the whole image shifted.

    // Correct approach:
    // Translate to (x - c*w, y - r*h) 
    // Draw full image scaled.
    // But that's inefficient for 1000 pieces.
    // Better: Draw only the relevant sub-region + bleed.

    const bleed = Math.max(p.width, p.height) * 0.3; // Enough to cover tabs
    const srcX = p.c * p.width - bleed;
    const srcY = p.r * p.height - bleed;
    const srcW = p.width + bleed * 2;
    const srcH = p.height + bleed * 2;

    const dstX = x - bleed * scale;
    const dstY = y - bleed * scale;
    const dstW = w + bleed * 2 * scale;
    const dstH = h + bleed * 2 * scale;

    ctx.drawImage(state.image,
        srcX, srcY, srcW, srcH,
        dstX, dstY, dstW, dstH
    );

    ctx.restore();

    // Draw Outline
    ctx.save();
    createPiecePath(ctx, x, y, w, h, p.shapes);
    ctx.strokeStyle = STYLE.strokeColor;
    ctx.lineWidth = STYLE.strokeWidth * 0.5; // Thinner lines look better
    ctx.stroke();
    // Highlight if selected?
    ctx.restore();
}

function createPiecePath(ctx, x, y, w, h, shapes) {
    ctx.beginPath();

    // Top
    ctx.moveTo(x, y);
    if (shapes.top === 0) {
        ctx.lineTo(x + w, y);
    } else {
        drawEdge(ctx, x, y, x + w, y, shapes.top);
    }

    // Right
    if (shapes.right === 0) {
        ctx.lineTo(x + w, y + h);
    } else {
        drawEdge(ctx, x + w, y, x + w, y + h, shapes.right);
    }

    // Bottom
    if (shapes.bottom === 0) {
        ctx.lineTo(x, y + h);
    } else {
        drawEdge(ctx, x + w, y + h, x, y + h, shapes.bottom);
    }

    // Left
    if (shapes.left === 0) {
        ctx.lineTo(x, y);
    } else {
        drawEdge(ctx, x, y + h, x, y, shapes.left);
    }

    ctx.closePath();
}

function drawEdge(ctx, x1, y1, x2, y2, type) {
    // Type: 1 (outer tab), -1 (inner slot)
    // The vector from P1 to P2
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);

    // Normalized perpendicular vector
    // (dy, -dx) is 90 deg clockwise? (0,1)->(-1,0). Yes.
    // If type is 1, we want "out" (usually "right" of the path direction CLOCKWISE).
    // The path is drawn clockwise (Top L->R, Right T->B, Bottom R->L, Left B->T).
    // So "Out" is always to the "Left" of the direction vector?
    // Wait.
    // Top: L->R. "Out" is Up (negative Y).   Perp (dy, -dx) = (0, -1). Correct.
    // Right: T->B. "Out" is Right (pos X).   Perp (1, 0). Correct.
    // Bottom: R->L. "Out" is Down (pos Y).   Perp (0, 1). Correct.
    // Left: B->T. "Out" is Left (neg X).     Perp (-1, 0). Correct.

    // So we add (perpX * type)

    const neckW = len * 0.2;
    const tabW = len * 0.3; // head width
    const tabH = len * 0.25; // height (amplitude)

    // 3 cubic bezier curves for a nice jigsaw shape
    // Simplify: just standard curves.

    // Base points along the edge
    const p1 = 0.35;
    const p2 = 0.65;

    // Control points variation
    const cpV = 0.1; // vertical variance
    const cpH = 0.2; // horizontal variance (along line)

    // We can define the points in a local coordinate system (0 to 1 along line, y is displacement)
    // then transform.

    const s = type * tabH; // Sign and magnitude of bump

    // Transform function
    const t = (u, v) => [
        x1 + dx * u - dy * v,
        y1 + dy * u + dx * v
    ];

    // Standard Jigsaw Curvature (approximate)
    // A: 0 -> 1/3
    // B: 1/3 -> bump
    // C: bump -> 2/3
    // D: 2/3 -> 1

    // Implementation:
    // CP1, CP2, End

    const xBase = x1;
    const yBase = y1;

    // Helper
    const curve = (cx1, cy1, cx2, cy2, ex, ey) => {
        ctx.bezierCurveTo(
            xBase + dx * cx1 - dy * cy1,
            yBase + dy * cx1 + dx * cy1,
            xBase + dx * cx2 - dy * cy2,
            yBase + dy * cx2 + dx * cy2,
            xBase + dx * ex - dy * ey,
            yBase + dy * ex + dx * ey
        );
    };

    // Shoulder 1 (Soft start)
    // 0 -> 0.35 roughly
    // curve(0.2, 0, 0.25, 0, 0.35, 0); // Straightish?

    // Using a more robust shape definition:
    // Based on standard jigsaw sizes (approx 20-30% of width)
    const amp = type * 0.25; // Amplitude of tab

    // Curve 1: To base of neck
    curve(
        0.20, 0,
        0.25, 0,
        1 / 3, 0.05 * type // Very slight bump out to start neck
    );

    // Curve 2: The Neck & Head (Left half)
    curve(
        1 / 3 + 0.05, amp * 1.2, // CP1 goes high and out
        0.5 - 0.05, amp,   // CP2
        0.5, amp           // Top of head
    );

    // Curve 3: The Neck & Head (Right half)
    curve(
        0.5 + 0.05, amp,
        2 / 3 - 0.05, amp * 1.2,
        2 / 3, 0.05 * type
    );

    // Curve 4: Shoulder 2
    curve(
        0.75, 0,
        0.80, 0,
        1, 0
    );
}


// -------------------------------------------------------------
// Interaction
// -------------------------------------------------------------

function onPointerDown(e) {
    if (!state.image) return;

    const rect = app.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    // Convert to world coordinates
    const world = screenToWorld(sx, sy);
    const x = world.x;
    const y = world.y;

    // Hit test reverse order (top to bottom)
    for (let i = state.pieces.length - 1; i >= 0; i--) {
        const p = state.pieces[i];
        if (isInsidePiece(x, y, p)) {
            if (p.isLocked) continue; // Skip locked pieces, check underneath
            state.draggingGroup = getGroup(p.id);
            state.dragAnchor = { x: sx, y: sy };
            state.pieces.forEach(piece => {
                if (state.draggingGroup.includes(piece.id)) {
                    piece.startX = piece.x;
                    piece.startY = piece.y;
                }
            });

            app.canvas.setPointerCapture(e.pointerId);
            draw();
            return;
        }
    }

    // No piece hit -> start panning (if zoomed)
    if (state.viewZoom !== 1 || state.viewX !== 0 || state.viewY !== 0) {
        state.isPanning = true;
        state.panAnchor = { x: sx, y: sy };
        state.panStart = { x: state.viewX, y: state.viewY };
        app.canvas.setPointerCapture(e.pointerId);
    }
}

function onPointerMove(e) {
    const rect = app.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (state.isPanning) {
        state.viewX = state.panStart.x + (sx - state.panAnchor.x);
        state.viewY = state.panStart.y + (sy - state.panAnchor.y);
        draw();
        return;
    }

    if (!state.draggingGroup) return;

    // Delta in screen space, convert to world delta
    const dx = (sx - state.dragAnchor.x) / state.viewZoom;
    const dy = (sy - state.dragAnchor.y) / state.viewZoom;

    state.draggingGroup.forEach(id => {
        const p = getPiece(id);
        p.x = p.startX + dx;
        p.y = p.startY + dy;
    });

    draw();
}

function onPointerUp(e) {
    if (state.isPanning) {
        state.isPanning = false;
        app.canvas.releasePointerCapture(e.pointerId);
        return;
    }

    if (!state.draggingGroup) return;

    // Check snapping
    checkSnapping(state.draggingGroup);

    state.draggingGroup = null;
    app.canvas.releasePointerCapture(e.pointerId);

    checkCompletion();
    draw();
}

function getPiece(id) {
    return state.pieces.find(p => p.id === id);
}

function getGroup(id) {
    return state.groups.find(g => g.includes(id));
}

function isInsidePiece(x, y, p) {
    // Simple bounding box for hit test
    const scale = state.canvasScale;
    const bleed = p.width * 0.2; // roughly
    // Check loosely first
    return (
        x >= p.x - bleed &&
        x <= p.x + p.width * scale + bleed &&
        y >= p.y - bleed &&
        y <= p.y + p.height * scale + bleed
    );
    // For precise hit testing we'd need isPointInPath, but rect is usually fine for puzzles
}


function checkSnapping(groupIds) {
    const scale = state.canvasScale;
    const snapDist = 30;

    let snappedToBoard = false;

    // 1. Check Board Snap
    if (state.boardRect.w > 0) {
        for (const id of groupIds) {
            const p = getPiece(id);
            const targetX = state.boardRect.x + p.c * state.pieceWidth * scale;
            const targetY = state.boardRect.y + p.r * state.pieceHeight * scale;
            const dist = Math.sqrt(Math.pow(p.x - targetX, 2) + Math.pow(p.y - targetY, 2));

            if (dist < snapDist) {
                const offsetX = targetX - p.x;
                const offsetY = targetY - p.y;
                groupIds.forEach(gid => {
                    const gp = getPiece(gid);
                    gp.x += offsetX;
                    gp.y += offsetY;
                    gp.isLocked = true; // Lock the piece!
                });
                snappedToBoard = true;
                break;
            }
        }
    }

    // 2. Check Neighbor Snap (always, even after board snap)
    const currentGroup = getGroup(groupIds[0]);
    for (const id of currentGroup) {
        const p = getPiece(id);
        const neighbors = [
            { r: p.r - 1, c: p.c },
            { r: p.r + 1, c: p.c },
            { r: p.r, c: p.c - 1 },
            { r: p.r, c: p.c + 1 }
        ];

        for (const n of neighbors) {
            const neighbor = state.pieces.find(np => np.r === n.r && np.c === n.c);
            if (!neighbor) continue;
            if (getGroup(neighbor.id) === getGroup(p.id)) continue;

            const idealDistX = (p.c - neighbor.c) * state.pieceWidth * scale;
            const idealDistY = (p.r - neighbor.r) * state.pieceHeight * scale;
            const actualDistX = p.x - neighbor.x;
            const actualDistY = p.y - neighbor.y;
            const diff = Math.sqrt(Math.pow(actualDistX - idealDistX, 2) + Math.pow(actualDistY - idealDistY, 2));

            if (diff < snapDist) {
                // Check lock status before merge
                const neighborGroup = getGroup(neighbor.id);
                const neighborLocked = neighborGroup.some(gid => getPiece(gid).isLocked);
                const selfLocked = getGroup(p.id).some(gid => getPiece(gid).isLocked);

                // Merge groups
                mergeGroups(p.id, neighbor.id);

                // Propagate lock: if either side was locked, lock entire merged group
                if (neighborLocked || selfLocked) {
                    getGroup(p.id).forEach(gid => getPiece(gid).isLocked = true);
                }

                // Align visuals
                if ((neighborLocked || selfLocked) && !snappedToBoard) {
                    const offsetX = neighbor.x + idealDistX - p.x;
                    const offsetY = neighbor.y + idealDistY - p.y;
                    groupIds.forEach(gid => {
                        const gp = getPiece(gid);
                        gp.x += offsetX;
                        gp.y += offsetY;
                    });
                } else if (!snappedToBoard) {
                    const offsetX = neighbor.x + idealDistX - p.x;
                    const offsetY = neighbor.y + idealDistY - p.y;
                    groupIds.forEach(gid => {
                        const gp = getPiece(gid);
                        gp.x += offsetX;
                        gp.y += offsetY;
                    });
                }
                return;
            }
        }
    }
}

function mergeGroups(id1, id2) {
    const g1 = getGroup(id1);
    const g2 = getGroup(id2);
    if (g1 === g2) return;

    // Remove g1 and g2 from groups
    state.groups = state.groups.filter(g => g !== g1 && g !== g2);

    // Create new group
    const newGroup = [...g1, ...g2];
    state.groups.push(newGroup);

    // Update dragging group if active
    if (state.draggingGroup === g1 || state.draggingGroup === g2) {
        state.draggingGroup = newGroup;
    }
}

function checkCompletion() {
    // Check if ALL pieces are locked in place
    const allLocked = state.pieces.every(p => p.isLocked);

    if (allLocked && !state.isComplete) {
        // Complete!
        stopTimer();
        state.isComplete = true;
        document.getElementById('completion-time').textContent = `Time: ${app.timer.textContent}`;
        app.modal.hidden = false;

        // Effects
        triggerConfetti();
        playFanfare();

        // Track stats & achievements
        onPuzzleComplete();
    }
}

// -------------------------------------------------------------
// Effects
// -------------------------------------------------------------

function triggerConfetti() {
    const canvas = app.canvas;
    const ctx = canvas.getContext('2d');

    // Simple confetti implementation
    const particles = [];
    const colors = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6'];

    for (let i = 0; i < 150; i++) {
        particles.push({
            x: canvas.width / 2,
            y: canvas.height / 2,
            vx: (Math.random() - 0.5) * 20,
            vy: (Math.random() - 1) * 20 - 5,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 10 + 5,
            rotation: Math.random() * Math.PI * 2,
            vRotation: (Math.random() - 0.5) * 0.2
        });
    }

    let frameId;
    function animateConfetti() {
        if (!state.isComplete || app.modal.hidden) {
            cancelAnimationFrame(frameId);
            return; // Stop if closed
        }

        // We need to redraw the puzzle too otherwise it disappears!
        draw();

        // Draw confetti overlay
        particles.forEach((p, index) => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.5; // Gravity
            p.rotation += p.vRotation;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();

            // Bounce bottom
            if (p.y > canvas.height) {
                p.y = canvas.height;
                p.vy *= -0.5;
            }
        });

        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'; // Flash effect? No, simple overlay

        frameId = requestAnimationFrame(animateConfetti);
    }

    animateConfetti();
}

function playFanfare() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        const ctx = new AudioContext();

        // Simple major triad arpeggio
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C Major: C4, E4, G4, C5

        const now = ctx.currentTime;

        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.value = freq;

            osc.connect(gain);
            gain.connect(ctx.destination);

            const start = now + i * 0.1;
            osc.start(start);
            gain.gain.setValueAtTime(0.15, start);
            gain.gain.exponentialRampToValueAtTime(0.01, start + 1.5);
            osc.stop(start + 1.5);
        });

        // Final chord
        notes.forEach((freq) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square'; // Brighter tone
            osc.frequency.value = freq;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + 0.4);
            gain.gain.setValueAtTime(0.08, now + 0.4);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 2.0);
            osc.stop(now + 2.0);
        });

    } catch (e) {
        console.error("Audio play failed", e);
    }
}

// Reset Logic
const resetModal = document.getElementById('reset-modal');
const resetBtn = document.getElementById('reset-btn');
const resetAllBtn = document.getElementById('reset-all-btn');
const resetUnlockedBtn = document.getElementById('reset-unlocked-btn');
const cancelResetBtn = document.getElementById('cancel-reset-btn');

if (resetBtn) {
    resetBtn.addEventListener('click', () => {
        resetModal.hidden = false;
    });
}

if (resetAllBtn) {
    resetAllBtn.addEventListener('click', () => {
        scatterPieces(false);
        resetModal.hidden = true;
    });
}

if (resetUnlockedBtn) {
    resetUnlockedBtn.addEventListener('click', () => {
        scatterPieces(true);
        resetModal.hidden = true;
    });
}

if (cancelResetBtn) {
    cancelResetBtn.addEventListener('click', () => {
        resetModal.hidden = true;
    });
}


// Toast Notification
const toast = document.getElementById('toast');

function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.hidden = false;
    toast.style.display = 'block';
    setTimeout(function () {
        toast.hidden = true;
        toast.style.display = 'none';
    }, 2000);
}

// Save & Resume Logic
const saveBtn = document.getElementById('save-btn');
const resumeBtn = document.getElementById('resume-btn');
const SAVE_KEY = 'jigsaw_puzzle_save_v1';

function compressImage(img, maxSize, quality) {
    var canvas = document.createElement('canvas');
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;

    // Resize if larger than maxSize
    if (w > maxSize || h > maxSize) {
        if (w > h) {
            h = Math.round(h * (maxSize / w));
            w = maxSize;
        } else {
            w = Math.round(w * (maxSize / h));
            h = maxSize;
        }
    }

    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
}

function saveGame() {
    if (!state.image) return;

    var elapsed = Math.floor((Date.now() - state.startTime) / 1000);

    // Try progressively smaller sizes/quality to fit in localStorage
    var attempts = [
        { maxSize: 1200, quality: 0.7 },
        { maxSize: 800, quality: 0.6 },
        { maxSize: 600, quality: 0.5 },
        { maxSize: 400, quality: 0.4 }
    ];

    var saved = false;
    for (var a = 0; a < attempts.length; a++) {
        var compressed = compressImage(state.image, attempts[a].maxSize, attempts[a].quality);

        var data = {
            pieces: state.pieces,
            groups: state.groups,
            boardRect: state.boardRect,
            rows: state.rows,
            cols: state.cols,
            pieceWidth: state.pieceWidth,
            pieceHeight: state.pieceHeight,
            canvasScale: state.canvasScale,
            targetPieceCount: state.targetPieceCount,
            elapsedTime: elapsed,
            imageSrc: compressed,
            originalWidth: state.image.naturalWidth || state.image.width,
            originalHeight: state.image.naturalHeight || state.image.height
        };

        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(data));
            showToast('\u4fdd\u5b58\u3057\u307e\u3057\u305f\uff01');
            checkSaveData();
            saved = true;
            break;
        } catch (e) {
            console.warn('Save attempt ' + (a + 1) + ' failed (maxSize=' + attempts[a].maxSize + '), trying smaller...', e);
        }
    }

    if (!saved) {
        alert('\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\n\u753b\u50cf\u306e\u30b5\u30a4\u30ba\u304c\u5927\u304d\u3059\u304e\u307e\u3059\u3002');
    }
}

function loadGame() {
    var json = localStorage.getItem(SAVE_KEY);
    if (!json) return;

    try {
        var data = JSON.parse(json);

        var img = new Image();
        img.onload = function () {
            state.image = img;
            state.pieces = data.pieces;
            state.groups = data.groups;
            state.boardRect = data.boardRect;
            state.rows = data.rows;
            state.cols = data.cols;
            state.targetPieceCount = data.targetPieceCount;

            // Recalculate pieceWidth/pieceHeight from actual loaded image
            // (image may have been compressed/resized during save)
            state.pieceWidth = img.naturalWidth / data.cols;
            state.pieceHeight = img.naturalHeight / data.rows;

            // Recalculate canvasScale to match compressed image to board size
            state.canvasScale = data.boardRect.w / img.naturalWidth;

            // Update each piece's width/height to match
            state.pieces.forEach(function (p) {
                p.width = state.pieceWidth;
                p.height = state.pieceHeight;
            });

            // Restore timer
            state.startTime = Date.now() - (data.elapsedTime * 1000);

            // Switch screen
            switchScreen('game');

            requestAnimationFrame(function () {
                resizeCanvas();

                // Resume timer
                state.isComplete = false;
                clearInterval(state.timerInterval);
                state.timerInterval = setInterval(function () {
                    var delta = Math.floor((Date.now() - state.startTime) / 1000);
                    var m = Math.floor(delta / 60).toString().padStart(2, '0');
                    var s = (delta % 60).toString().padStart(2, '0');
                    app.timer.textContent = m + ':' + s;
                }, 1000);

                // Update preview
                app.upload.preview.src = img.src;
                app.upload.preview.hidden = false;
                app.upload.placeholder.hidden = true;

                draw();
            });
        };
        img.src = data.imageSrc;

    } catch (e) {
        console.error('Load failed', e);
        alert('\u30bb\u30fc\u30d6\u30c7\u30fc\u30bf\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002');
    }
}

function checkSaveData() {
    try {
        var data = localStorage.getItem(SAVE_KEY);
        if (data) {
            if (resumeBtn) {
                resumeBtn.hidden = false;
                resumeBtn.style.display = 'block';
            }
        } else {
            if (resumeBtn) {
                resumeBtn.hidden = true;
                resumeBtn.style.display = 'none';
            }
        }
    } catch (e) {
        console.error('LocalStorage check failed', e);
    }
}

// Bind events
if (saveBtn) {
    saveBtn.onclick = saveGame;
}

if (resumeBtn) {
    resumeBtn.onclick = loadGame;
}

checkSaveData();

// -------------------------------------------------------------
// Achievement System
// -------------------------------------------------------------

const STATS_KEY = 'jigsaw_puzzle_stats_v1';

const ACHIEVEMENTS = [
    {
        id: 'first_clear',
        name: '\u306f\u3058\u3081\u306e\u4e00\u6b69',
        desc: '\u521d\u3081\u3066\u30d1\u30ba\u30eb\u3092\u30af\u30ea\u30a2',
        icon: '\ud83c\udfaf',
        check: (s) => s.totalClears >= 1
    },
    {
        id: 'easy_master',
        name: '\u304b\u3093\u305f\u3093\u30de\u30b9\u30bf\u30fc',
        desc: '\u304b\u3093\u305f\u3093\u30e2\u30fc\u30c9\u30925\u56de\u30af\u30ea\u30a2',
        icon: '\u2b50',
        check: (s) => ((s.clearsByDifficulty['2'] || 0) + (s.clearsByDifficulty['4'] || 0)) >= 5
    },
    {
        id: 'recommend_clear',
        name: '\u304a\u3059\u3059\u3081\u30af\u30ea\u30a2',
        desc: '\u304a\u3059\u3059\u3081\u96e3\u6613\u5ea6\u309210\u56de\u30af\u30ea\u30a2',
        icon: '\ud83c\udfc5',
        check: (s) => {
            const keys = ['9', '20', '35', '56'];
            let sum = 0;
            keys.forEach(k => sum += (s.clearsByDifficulty[k] || 0));
            return sum >= 10;
        }
    },
    {
        id: 'challenger',
        name: '\u30c1\u30e3\u30ec\u30f3\u30b8\u30e3\u30fc',
        desc: '\u9ad8\u96e3\u6613\u5ea6\u30923\u56de\u30af\u30ea\u30a2',
        icon: '\ud83c\udfc6',
        check: (s) => {
            const keys = ['150', '500', '1000'];
            let sum = 0;
            keys.forEach(k => sum += (s.clearsByDifficulty[k] || 0));
            return sum >= 3;
        }
    },
    {
        id: 'speed_star',
        name: '\u30b9\u30d4\u30fc\u30c9\u30b9\u30bf\u30fc',
        desc: '1\u5206\u4ee5\u5185\u306b\u30af\u30ea\u30a2',
        icon: '\u26a1',
        check: (s) => s.fastestTime !== null && s.fastestTime <= 60
    },
    {
        id: 'puzzle_lover',
        name: '\u30d1\u30ba\u30eb\u5927\u597d\u304d',
        desc: '\u5408\u8a0830\u56de\u30af\u30ea\u30a2',
        icon: '\ud83d\udc8e',
        check: (s) => s.totalClears >= 30
    },
    {
        id: 'ironman',
        name: '\u9244\u4eba',
        desc: '\u5408\u8a08100\u56de\u30af\u30ea\u30a2',
        icon: '\ud83d\udc51',
        check: (s) => s.totalClears >= 100
    },
    // Per-difficulty achievements
    { id: 'clear_2', name: '2\u30d4\u30fc\u30b9\u30af\u30ea\u30a2', desc: '2\u30d4\u30fc\u30b9\u3092\u30af\u30ea\u30a2', icon: '\ud83e\udde9', diffKey: '2', check: (s) => (s.clearsByDifficulty['2'] || 0) >= 1 },
    { id: 'clear_4', name: '4\u30d4\u30fc\u30b9\u30af\u30ea\u30a2', desc: '4\u30d4\u30fc\u30b9\u3092\u30af\u30ea\u30a2', icon: '\ud83e\udde9', diffKey: '4', check: (s) => (s.clearsByDifficulty['4'] || 0) >= 1 },
    { id: 'clear_9', name: '6~12\u30d4\u30fc\u30b9\u30af\u30ea\u30a2', desc: '6~12\u30d4\u30fc\u30b9\u3092\u30af\u30ea\u30a2', icon: '\ud83d\uddbc\ufe0f', diffKey: '9', check: (s) => (s.clearsByDifficulty['9'] || 0) >= 1 },
    { id: 'clear_20', name: '12~24\u30d4\u30fc\u30b9\u30af\u30ea\u30a2', desc: '12~24\u30d4\u30fc\u30b9\u3092\u30af\u30ea\u30a2', icon: '\ud83d\uddbc\ufe0f', diffKey: '20', check: (s) => (s.clearsByDifficulty['20'] || 0) >= 1 },
    { id: 'clear_35', name: '24~40\u30d4\u30fc\u30b9\u30af\u30ea\u30a2', desc: '24~40\u30d4\u30fc\u30b9\u3092\u30af\u30ea\u30a2', icon: '\ud83d\uddbc\ufe0f', diffKey: '35', check: (s) => (s.clearsByDifficulty['35'] || 0) >= 1 },
    { id: 'clear_56', name: '50~60\u30d4\u30fc\u30b9\u30af\u30ea\u30a2', desc: '50~60\u30d4\u30fc\u30b9\u3092\u30af\u30ea\u30a2', icon: '\ud83d\uddbc\ufe0f', diffKey: '56', check: (s) => (s.clearsByDifficulty['56'] || 0) >= 1 },
    { id: 'clear_150', name: '\u521d\u5fc3\u8005\u3080\u3051\u30af\u30ea\u30a2', desc: '100~300\u30d4\u30fc\u30b9\u3092\u30af\u30ea\u30a2', icon: '\ud83d\udd25', diffKey: '150', check: (s) => (s.clearsByDifficulty['150'] || 0) >= 1 },
    { id: 'clear_500', name: '\u3058\u3063\u304f\u308a\u30af\u30ea\u30a2', desc: '500\u30d4\u30fc\u30b9\u3092\u30af\u30ea\u30a2', icon: '\ud83d\udd25', diffKey: '500', check: (s) => (s.clearsByDifficulty['500'] || 0) >= 1 },
    { id: 'clear_1000', name: '\u8d85\u96e3\u554f\u30af\u30ea\u30a2', desc: '1000\u30d4\u30fc\u30b9\u3092\u30af\u30ea\u30a2', icon: '\ud83c\udf1f', diffKey: '1000', check: (s) => (s.clearsByDifficulty['1000'] || 0) >= 1 },
    // Master achievement
    {
        id: 'all_clear',
        name: '\u5168\u96e3\u6613\u5ea6\u5236\u8987',
        desc: '\u5168\u3066\u306e\u96e3\u6613\u5ea6\u3092\u30af\u30ea\u30a2',
        icon: '\ud83c\udf08',
        check: (s) => {
            const allKeys = ['2', '4', '9', '20', '35', '56', '150', '500', '1000'];
            return allKeys.every(k => (s.clearsByDifficulty[k] || 0) >= 1);
        }
    }
];

function loadStats() {
    try {
        const json = localStorage.getItem(STATS_KEY);
        if (json) return JSON.parse(json);
    } catch (e) {
        console.error('Stats load failed', e);
    }
    return { totalClears: 0, clearsByDifficulty: {}, fastestTime: null, unlockedAchievements: [] };
}

function saveStats(stats) {
    try {
        localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (e) {
        console.error('Stats save failed', e);
    }
}

function onPuzzleComplete() {
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    const diffKey = String(state.targetPieceCount);

    const stats = loadStats();
    stats.totalClears = (stats.totalClears || 0) + 1;
    stats.clearsByDifficulty[diffKey] = (stats.clearsByDifficulty[diffKey] || 0) + 1;
    if (stats.fastestTime === null || elapsed < stats.fastestTime) {
        stats.fastestTime = elapsed;
    }

    // Check for newly unlocked achievements
    const newlyUnlocked = [];
    ACHIEVEMENTS.forEach(ach => {
        if (!stats.unlockedAchievements.includes(ach.id) && ach.check(stats)) {
            stats.unlockedAchievements.push(ach.id);
            newlyUnlocked.push(ach);
        }
    });

    saveStats(stats);

    // Show toast for each new achievement (staggered)
    newlyUnlocked.forEach((ach, i) => {
        setTimeout(() => showAchievementToast(ach), 1500 + i * 2500);
    });
}

function showAchievementToast(ach) {
    const el = document.getElementById('achievement-toast');
    if (!el) return;
    el.textContent = ach.icon + ' \u5b9f\u7e3e\u89e3\u9664\uff1a' + ach.name;
    el.hidden = false;
    el.style.display = 'block';
    // Re-trigger animation
    el.style.animation = 'none';
    el.offsetHeight; // Force reflow
    el.style.animation = '';

    setTimeout(() => {
        el.hidden = true;
        el.style.display = 'none';
    }, 2500);
}

function renderAchievementModal() {
    const grid = document.getElementById('achievement-grid');
    if (!grid) return;

    const stats = loadStats();
    grid.innerHTML = '';

    ACHIEVEMENTS.forEach(ach => {
        const unlocked = stats.unlockedAchievements.includes(ach.id);
        const card = document.createElement('div');
        card.className = 'achievement-card ' + (unlocked ? 'unlocked' : 'locked');

        // Progress text
        let progressText = '';
        if (!unlocked) {
            progressText = getProgressText(ach, stats);
        }

        card.innerHTML =
            '<div class="ach-icon">' + ach.icon + '</div>' +
            '<div class="ach-info">' +
            '<div class="ach-name">' + ach.name + '</div>' +
            '<div class="ach-desc">' + ach.desc + '</div>' +
            (progressText ? '<div class="ach-progress">' + progressText + '</div>' : '') +
            '</div>';

        grid.appendChild(card);
    });
}

function getProgressText(ach, stats) {
    // Per-difficulty achievements
    if (ach.diffKey) {
        const cnt = stats.clearsByDifficulty[ach.diffKey] || 0;
        return cnt >= 1 ? '' : '0/1';
    }
    switch (ach.id) {
        case 'first_clear':
            return stats.totalClears + '/1';
        case 'easy_master': {
            const cnt = (stats.clearsByDifficulty['2'] || 0) + (stats.clearsByDifficulty['4'] || 0);
            return cnt + '/5';
        }
        case 'recommend_clear': {
            let sum = 0;
            ['9', '20', '35', '56'].forEach(k => sum += (stats.clearsByDifficulty[k] || 0));
            return sum + '/10';
        }
        case 'challenger': {
            let sum = 0;
            ['150', '500', '1000'].forEach(k => sum += (stats.clearsByDifficulty[k] || 0));
            return sum + '/3';
        }
        case 'speed_star':
            return stats.fastestTime !== null ? stats.fastestTime + '\u79d2' : '--';
        case 'puzzle_lover':
            return stats.totalClears + '/30';
        case 'ironman':
            return stats.totalClears + '/100';
        case 'all_clear': {
            const allKeys = ['2', '4', '9', '20', '35', '56', '150', '500', '1000'];
            const cleared = allKeys.filter(k => (stats.clearsByDifficulty[k] || 0) >= 1).length;
            return cleared + '/' + allKeys.length;
        }
        default:
            return '';
    }
}

// Achievement Modal UI
const achievementsBtn = document.getElementById('achievements-btn');
const achievementModal = document.getElementById('achievement-modal');
const closeAchievementsBtn = document.getElementById('close-achievements-btn');

if (achievementsBtn) {
    achievementsBtn.addEventListener('click', () => {
        renderAchievementModal();
        achievementModal.hidden = false;
    });
}

if (closeAchievementsBtn) {
    closeAchievementsBtn.addEventListener('click', () => {
        achievementModal.hidden = true;
    });
}

// Help Modal UI
const helpBtn = document.getElementById('help-btn');
const helpModal = document.getElementById('help-modal');
const closeHelpBtn = document.getElementById('close-help-btn');

if (helpBtn) {
    helpBtn.addEventListener('click', () => {
        helpModal.hidden = false;
    });
}

if (closeHelpBtn) {
    closeHelpBtn.addEventListener('click', () => {
        helpModal.hidden = true;
    });
}

initControls();

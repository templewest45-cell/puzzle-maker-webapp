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
    isComplete: false
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
        switchScreen('setup');
    });

    // Hint / Guide Toggle
    app.buttons.hint.addEventListener('click', () => {
        state.showGuide = !state.showGuide;
        draw();
    });

    // Resize
    window.addEventListener('resize', () => {
        if (!app.screens.game.hidden) resizeCanvas();
    });

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
}

// Game Logic
function startGame() {
    if (!state.image) return;
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
    if (rows < 2) rows = 2;
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

    // Draw Tray Background
    ctx.fillStyle = STYLE.trayColor;
    ctx.fillRect(0, 0, app.canvas.width, app.canvas.height);

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

        // Draw Guide (Ghost image) - Optional, maybe make it very faint?
        if (state.showGuide) {
            ctx.globalAlpha = 0.2;
            ctx.drawImage(state.image, br.x, br.y, br.w, br.h);
            ctx.globalAlpha = 1.0;
        }

        // Grid lines (Optional, for "beginner")
        // ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        // ctx.beginPath(); ...
    }

    // Filter pieces to draw dragging one last
    const renderOrder = [];
    state.groups.forEach(group => {
        // Add all pieces, but if this group is dragging, we might want to draw it last.
        // Simple z-ordering: just iterate groups. 
        // If we want dragging group on top, we sort.
    });

    // For now simple loop
    state.pieces.forEach(p => {
        // If it's being dragged, skip it here and draw later? 
        // Or just draw everything in order.
    });

    // Draw all pieces
    // Note: We need to draw "connected" pieces together if we want them to look seamless?
    // Actually, drawing them individually is fine as long as the path is perfect.

    // Sort pieces: non-dragging first, dragging last (so it floats above)
    const sortedPieces = [...state.pieces].sort((a, b) => {
        const groupA = getGroup(a.id);
        const groupB = getGroup(b.id);
        if (groupA === state.draggingGroup) return 1;
        if (groupB === state.draggingGroup) return -1;
        return 0;
    });

    sortedPieces.forEach(p => drawPiece(ctx, p));
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
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Hit test reverse order (top to bottom)
    for (let i = state.pieces.length - 1; i >= 0; i--) {
        const p = state.pieces[i];
        if (isInsidePiece(x, y, p)) {
            if (p.isLocked) continue; // Skip locked pieces, check underneath
            state.draggingGroup = getGroup(p.id);
            // Calculate offset for all pieces in group relative to pointer
            // We only need the offset for the specific piece we clicked, 
            // and we apply delta to all.
            state.dragAnchor = { x, y };
            state.pieces.forEach(piece => {
                if (state.draggingGroup.includes(piece.id)) {
                    piece.startX = piece.x;
                    piece.startY = piece.y;

                    // Also store initial offset relative to group anchor just in case?
                }
            });

            // Move to end of array to draw on top
            // (Strictly we should reorder the array or use a display list, 
            // but for simple logic we just track 'draggingGroup' and draw it last)

            app.canvas.setPointerCapture(e.pointerId);
            draw();
            return;
        }
    }
}

function onPointerMove(e) {
    if (!state.draggingGroup) return;

    const rect = app.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const dx = x - state.dragAnchor.x;
    const dy = y - state.dragAnchor.y;

    state.draggingGroup.forEach(id => {
        const p = getPiece(id);
        p.x = p.startX + dx;
        p.y = p.startY + dy;
    });

    draw();
}

function onPointerUp(e) {
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
            gain.gain.setValueAtTime(0.5, start);
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
            gain.gain.setValueAtTime(0.2, now + 0.4);
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

initControls();

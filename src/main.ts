    // ===============================
    // main.ts
    // Entry point for the application
    // ===============================

    import { create, all, type MathNode, type EvalFunction } from "mathjs";
    const math = create(all!);

    // Types
    type Point = {x: number, y: number};

    // Animation phase enum
    enum Phase {
        Between = "Pause between functions",
        NextComponent = "Drawing next component function",
        AddVertical = "Adding vertical lines from x-axis to component function",
        Fadeout1 = "Fading component function away",
        MoveVertical = "Moving vertical lines to partial sum function",
        NewPartialSum = "Drawing new partial sum",
        Fadeout2 = "Fading old partial sum and vertical lines away",
        FadeoutFirstLoop = "Fading first component function into the partial sum's color"
    }

    const nextPhase: Record<Phase, Phase> = {
        [Phase.Between]:          Phase.NextComponent,
        [Phase.NextComponent]:    Phase.AddVertical,
        [Phase.AddVertical]:      Phase.Fadeout1,
        [Phase.Fadeout1]:         Phase.MoveVertical,
        [Phase.MoveVertical]:     Phase.NewPartialSum,
        [Phase.NewPartialSum]:    Phase.Fadeout2,
        [Phase.Fadeout2]:         Phase.Between,
        [Phase.FadeoutFirstLoop]: Phase.Between
    };

    // Constants
    const X_MIN = -2;
    const X_MAX = 2;
    const Y_MIN = -2;
    const Y_MAX = 2;
    const COUNT_SAMPLES = 1000;
    const L = 1; // Fourier limits from 0 to L = 1.
    const VERTICAL_BAR_OFFSET = 2; // Offset the first bar a bit from the left side of the canvas
    const VERTICAL_BAR_STEP = 5;
    const VERTICAL_BAR_ANIMATION_FRAMES = 300;
    const FADEOUT_FRAMES = 300;
    const FUNCTION_STRING = "(x-1)^2 + 1/2";
    const F_COORDINATES = getFCoordinates(X_MIN, X_MAX, COUNT_SAMPLES);
    const COUNT_0_TO_L_SAMPLES = 501;
    const F_0_TO_L_COORDINATES = getFCoordinates(0, L, COUNT_0_TO_L_SAMPLES);

    // ---- Grab DOM elements ----
    const canvasElement = document.getElementById("graph");
    if (!(canvasElement instanceof HTMLCanvasElement)) {
        throw new Error("Canvas element #graph not found");
    }
    const canvas = canvasElement;

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) {
        throw new Error("2D canvas context not available");
    }
    const ctx = ctx2d;

    // Optional status line
    const statusElement = document.getElementById("status");

    // ---- State-tracking variables ----
    let lastTime = 0;
    let currentFunctionSegmentsDrawn = 0;
    let currentFunctionSegments = Infinity;
    let newPartialFourierSumSegmentsDrawn = 0;
    let newPartialFourierSumSegments = Infinity;
    let verticalBarCurrentSegment = 0;
    let currentFourierN = 0;
    let partialFourierSumCoordinates: Point[] = [];
    let newPartialFourierSumCoordinates: Point[] = [];
    let currentFourierComponentFunction: (x: number) => number = (x) => 0;
    let currentFourierComponentCoordinates: Point[] = [];
    let verticalBarAnimationFramesDrawn = 0;
    let fadeout1FrameCount = 0;
    let fadeout2FrameCount = 0;
    let animationPhase = Phase.Between;

    // ---- Animation loop ----
    function animate(time: number) {
        const deltaTime = (time - lastTime) * 0.001; // seconds
        lastTime = time;
        if (animationPhase === Phase.Between) {
            incrementPhase();
        }
        else if (animationPhase === Phase.NextComponent) {
            if (currentFunctionSegmentsDrawn < currentFunctionSegments - 1)
                currentFunctionSegmentsDrawn += 1;
            else {
                if (currentFourierN === 1) {
                    partialFourierSumCoordinates = currentFourierComponentCoordinates;
                    setPhase(Phase.FadeoutFirstLoop);
                }
                else {
                    // TODO: Get correct new partial Fourier function and calculate coordinates with it. (Actually do this in a later phase; we need this after MoveVertical)
                    incrementPhase();
                }
            }
        }
        else if (animationPhase === Phase.AddVertical) {
            if (verticalBarCurrentSegment < currentFunctionSegments - VERTICAL_BAR_STEP) {
                verticalBarCurrentSegment += VERTICAL_BAR_STEP;
            }
            else
                incrementPhase();
        }

        else if (animationPhase === Phase.Fadeout1) {
            fadeout1FrameCount += 1;
            if (fadeout1FrameCount === FADEOUT_FRAMES) {
                currentFunctionSegmentsDrawn = 0;
                fadeout1FrameCount = 0;
                incrementPhase();
            }
        }

        else if (animationPhase === Phase.MoveVertical) {
            if (verticalBarAnimationFramesDrawn < VERTICAL_BAR_ANIMATION_FRAMES)
                verticalBarAnimationFramesDrawn += 1;
            else {
                newPartialFourierSumCoordinates = partialFourierSumCoordinates.map((point, i) => ({x: point.x, y: point.y + currentFourierComponentCoordinates[i]!.y}));
                newPartialFourierSumSegments = newPartialFourierSumCoordinates.length;
                incrementPhase();
            }
        }

        else if (animationPhase === Phase.NewPartialSum) {
            if (newPartialFourierSumSegmentsDrawn < newPartialFourierSumSegments)
                newPartialFourierSumSegmentsDrawn += 1;
            else
                incrementPhase();
        }

        else if (animationPhase === Phase.Fadeout2) {
            fadeout2FrameCount += 1;
            if (fadeout2FrameCount === FADEOUT_FRAMES) {
                currentFourierN += 1;
                currentFunctionSegmentsDrawn = 0;
                currentFourierComponentFunction = (x) => fourierSine(x, currentFourierN);
                currentFourierComponentCoordinates = getXYPairs(currentFourierComponentFunction, X_MIN, X_MAX, COUNT_SAMPLES);
                currentFunctionSegments = currentFourierComponentCoordinates.length;
                verticalBarAnimationFramesDrawn = 0;
                verticalBarCurrentSegment = VERTICAL_BAR_OFFSET;
                fadeout2FrameCount = 0;
                partialFourierSumCoordinates = newPartialFourierSumCoordinates;
                newPartialFourierSumSegmentsDrawn = 0;
                newPartialFourierSumCoordinates = [];
                incrementPhase();
            }
        }

        else if (animationPhase === Phase.FadeoutFirstLoop) {
            currentFunctionSegmentsDrawn = currentFourierComponentCoordinates.length;
            newPartialFourierSumSegmentsDrawn = newPartialFourierSumCoordinates.length;
            fadeout1FrameCount += 1;
            if (fadeout1FrameCount === FADEOUT_FRAMES) {
                currentFourierN += 1;
                currentFunctionSegmentsDrawn = 0;
                currentFourierComponentFunction = (x) => fourierSine(x, currentFourierN);
                currentFourierComponentCoordinates = getXYPairs(currentFourierComponentFunction, X_MIN, X_MAX, COUNT_SAMPLES);
                currentFunctionSegments = currentFourierComponentCoordinates.length;
                fadeout1FrameCount = 0;
                incrementPhase();
            }
        }

        // setStatus("Segments drawn:  " + currentFunctionSegmentsDrawn);
        update(deltaTime);
        render();

        requestAnimationFrame(animate);
    }

    // ---- Update logic (no rendering here) ----
    function update(dt: number): void {
        // Future:
        // - advance term interpolation
        // - respond to sliders
        // - update partial sums
        void dt; // prevents an "unused parameter" warning until you use dt
    }

    function drawAxes(): void {
        ctx.beginPath();
        ctx.strokeStyle = "#bbb";
        ctx.moveTo(mapX(X_MIN), mapY(0));
        ctx.lineTo(mapX(X_MAX), mapY(0));
        ctx.moveTo(mapX(0), mapY(Y_MIN));
        ctx.lineTo(mapX(0), mapY(Y_MAX));
        const xTickStart = mapY(0);
        const yTickStart = mapX(0);
        const tickLength = 10;
        for (let tick = Math.trunc(X_MIN); tick <= Math.trunc(X_MAX); ++tick) {
            ctx.moveTo(mapX(tick), xTickStart);
            ctx.lineTo(mapX(tick), xTickStart - tickLength);
        }
        for (let tick = Math.trunc(Y_MIN); tick <= Math.trunc(Y_MAX); ++tick) {
            ctx.moveTo(yTickStart, mapY(tick));
            ctx.lineTo(yTickStart + tickLength, mapY(tick));
        }
        ctx.stroke();
    }

    function drawF(): void {
        // Draw f(x)
        // This will change and just be a call of drawFunctionOfX later.
        ctx.beginPath();
        ctx.strokeStyle = "#d70";
        ctx.moveTo(mapX(-6), mapY(-6));
        ctx.lineTo(mapX(6), mapY(6));
        ctx.stroke();
    }

    function getFCoordinates(xMin: number, xMax: number, numberOfPoints: number) : Point[] {
        const expression: MathNode = math.parse(FUNCTION_STRING);
        const compiledExpression: EvalFunction = expression.compile();
        return getXYPairs((x) => compiledExpression.evaluate({ x }), xMin, xMax, numberOfPoints);
    }

    function drawFunctionOfX(coordinates: Point[], numSegments: number, color: string, alpha: number): void {
        if (numSegments < 1)
            return;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = alpha;

        ctx.beginPath();
        let inDrawableSpace = false; // A y value that is finite, real, and within the bounds of the canvas
        let previousCoordinate: { x: number, y: number } | null = null;

        const yOutsideRange = (y: number) => !Number.isFinite(y) || y < Y_MIN || y > Y_MAX;

        let numSegmentsDrawn = 0;
        for (const coordinate of coordinates) {
            let yIsValid = !yOutsideRange(coordinate.y);
            const xCanvas = mapX(coordinate.x);
            const yCanvas = mapY(coordinate.y);
            let yOnEdge = (yCanvas === 0 || yCanvas === canvas.height)
            if (!inDrawableSpace && yIsValid) {
                // "Entering" drawable space
                inDrawableSpace = true;
                if (previousCoordinate !== null && yOutsideRange(previousCoordinate.y)) {
                    const yBoundaryHit = previousCoordinate.y < Y_MIN ? Y_MIN : Y_MAX;
                    // Calculate the ratio of the length of the shortened line segment that hits the boundary to the full line segment length.
                    // This ratio will be the same for both the x and y directions by properties of similar triangles (or using other arguments).
                    // No need for abs() because the top and bottom always have the same sign
                    const lineLengthRatio = (yBoundaryHit - coordinate.y) / (previousCoordinate.y - coordinate.y);
                    const xBoundaryHit = coordinate.x + lineLengthRatio * (previousCoordinate.x - coordinate.x);
                    ctx.moveTo(mapX(xBoundaryHit), mapY(yBoundaryHit));
                    ctx.lineTo(xCanvas, yCanvas);
                    }
                else
                    // Coming back from an undefined region
                    ctx.moveTo(xCanvas, yCanvas);
            }
            else if (inDrawableSpace && yIsValid)
                ctx.lineTo(xCanvas, yCanvas);
            else if (inDrawableSpace && !yIsValid) {
                // "Exiting" drawable space
                inDrawableSpace = false;
                if (previousCoordinate !== null){  // yIsValid is already false, no need to check again
                    const boundaryHitY = coordinate.y < Y_MIN ? Y_MIN : Y_MAX;
                    const lineLengthRatio = (boundaryHitY - previousCoordinate.y) / (coordinate.y - previousCoordinate.y);
                    const boundaryHitX = previousCoordinate.x + lineLengthRatio * (coordinate.x - previousCoordinate.x);
                    ctx.lineTo(mapX(boundaryHitX), mapY(boundaryHitY));
                }
            }
            previousCoordinate = {x: coordinate.x, y: coordinate.y};
            numSegmentsDrawn += 1;
            if (numSegmentsDrawn === numSegments)
                break;
        };
        ctx.stroke();
        ctx.restore();
    }

    function drawVerticalBar(componentFunctionPoint: Point, partialSumFunctionPoint: Point, alpha: number) {
        const distanceToMove = partialSumFunctionPoint.y * (verticalBarAnimationFramesDrawn / VERTICAL_BAR_ANIMATION_FRAMES);
        ctx.save();
        ctx.beginPath();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#ff0";
        ctx.globalAlpha = alpha;
        ctx.moveTo(mapX(componentFunctionPoint.x), mapY(distanceToMove));
        ctx.lineTo(mapX(componentFunctionPoint.x), mapY(componentFunctionPoint.y + distanceToMove));
        ctx.stroke();
        ctx.restore();
    }

    function incrementPhase(): void {
        animationPhase = nextPhase[animationPhase];
        setStatus(animationPhase + "; N = " + currentFourierN);
    }

    function setPhase(newPhase: Phase) : void {
        animationPhase = newPhase;
        setStatus(animationPhase + "; N = " + currentFourierN);
    }

    // ---- Rendering logic (no state mutation here) ----
    function render(): void {
        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        drawAxes();
        drawFunctionOfX(F_COORDINATES, F_COORDINATES.length, "#d70", 1);
        let fadeout1Alpha = 1 - fadeout1FrameCount / FADEOUT_FRAMES;
        let fadeout2Alpha = 1 - fadeout2FrameCount / FADEOUT_FRAMES;
        if (partialFourierSumCoordinates.length > 0)
            drawFunctionOfX(partialFourierSumCoordinates, partialFourierSumCoordinates.length, "#3d7", fadeout2Alpha);

        drawFunctionOfX(currentFourierComponentCoordinates, currentFunctionSegmentsDrawn, "#6cf", fadeout1Alpha);

        for (let verticalBarIndex = VERTICAL_BAR_OFFSET; verticalBarIndex <= verticalBarCurrentSegment; verticalBarIndex += VERTICAL_BAR_STEP) {
            // TODO: Change this to only draw a bar if verticalBarIndex % VERTICAL_BAR_STEP === VERTICAL_BAR_OFFSET but the loop increases by 1 each time
            // This keeps the animation speed slower, matching the speed of drawing the graphs of the functions
            const componentFunctionPoint = currentFourierComponentCoordinates[verticalBarIndex];
            const partialSumFunctionPoint = partialFourierSumCoordinates[verticalBarIndex];
            if (componentFunctionPoint !== undefined && partialSumFunctionPoint !== undefined)
                drawVerticalBar(componentFunctionPoint, partialSumFunctionPoint, fadeout2Alpha)
        }

        if (newPartialFourierSumCoordinates.length > 0) {
            if (fadeout2FrameCount > 0)
                drawFunctionOfX(newPartialFourierSumCoordinates, newPartialFourierSumSegmentsDrawn, "#3d7", 1);
            drawFunctionOfX(newPartialFourierSumCoordinates, newPartialFourierSumSegmentsDrawn, "#91b", fadeout2Alpha);
        }
    }

    // ---- Kick things off ----
    currentFourierN = 1;
    currentFourierComponentFunction = (x) => fourierSine(x, currentFourierN);
    currentFourierComponentCoordinates = getXYPairs(currentFourierComponentFunction, X_MIN, X_MAX, COUNT_SAMPLES);
    currentFunctionSegments = currentFourierComponentCoordinates.length;
    verticalBarCurrentSegment = VERTICAL_BAR_OFFSET;
    requestAnimationFrame(animate);

    // ---- Debug helper (optional) ----
    function setStatus(text: string): void {
        if (statusElement) statusElement.textContent = text;
    }

    setStatus("Initialized");

    // Test function
    function fTest(x: number): number {
        // return Math.sin(5 * x) - x * x + 1 / (x + 2) + 7;
        // return fourier0Cosine(x) + fourier1Cosine(x) + fourier3Cosine(x);
        return fourierSine(x, 1) + fourierSine(x, 2) + fourierSine(x, 3) + fourierSine(x, 4) + fourierSine(x, 5) + fourierSine(x, 6) + fourierSine(x, 7);
    }

    // 3 Fourier terms for f(x) = x:
    function fourier0Cosine(x: number): number {
        return L/2; // Does not depend on x; also cut in half as the first term is a_0/2.
    }

    function fourier1Cosine(x: number): number {
        return -4*L/(Math.PI * Math.PI) * Math.cos(Math.PI * x / L);
    }

    function fourier3Cosine(x: number): number {
        return -4*L/(9 * Math.PI * Math.PI) * Math.cos(3 * Math.PI * x / L);
    }

    function fourierSine(x: number, n: number): number {
        return fourierTermCoefficient(F_0_TO_L_COORDINATES, n) * Math.sin(n * Math.PI * x / L);
        //return (n % 2 === 0 ? -1 : 1) * (2 * L / (n * Math.PI)) * Math.sin(n * Math.PI * x / L);
    }

    function simpson(left: Point, center: Point, right: Point, n: number): number {
        // Calculates the Simpson's rule numerical integral for a Fourier coefficient, given a panel of 3 points equally spaced in x.
        return (right.x - left.x) / (3 * L) * (
            left.y * Math.sin(n * Math.PI * left.x / L) +
            4 * center.y * Math.sin(n * Math.PI * center.x / L) +
            right.y * Math.sin(n * Math.PI * right.x / L)
        );
    }

    function fourierTermCoefficient(f_coordinates: Point[], n: number) : number {
        if (f_coordinates.length % 2 !== 1)
            return NaN;
        let integral = 0;
        for (let coordinateIndex = 0; coordinateIndex < f_coordinates.length - 2; coordinateIndex += 2) {
            const left = f_coordinates[coordinateIndex];
            const center = f_coordinates[coordinateIndex + 1];
            const right = f_coordinates[coordinateIndex + 2];
            if (!left || !center || !right)
                continue;
            integral += simpson(left, center, right, n);
        }
        return integral;
    }

    function getXYPairs(f: (x: number) => number, xMin: number, xMax: number, numberOfPoints: number): Point[] {
        const coordinates: Point[] = [];
        for (let i = 0; i < numberOfPoints; ++i) {
            const xi = xMin + i * (xMax - xMin)/(numberOfPoints - 1);
            const yi = f(xi);
            coordinates.push({x: xi, y: yi});
        }
        return coordinates;
    }

    function mapX(x: number): number {
        return (x - X_MIN) / (X_MAX - X_MIN) * canvas.width;
    }

    function mapY(y: number): number {
        return (Y_MAX - y) / (Y_MAX - Y_MIN) * canvas.height;  // Flipped sign
    }
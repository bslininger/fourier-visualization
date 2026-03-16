    // ===============================
    // main.ts
    // Entry point for the application
    // ===============================

    // Types
    type Point = {x: number, y: number};
    type FunctionAndCoordinates = {fn: (x: number) => number, coordinates: Point[]};

    // Animation phase enum
    enum Phase {
        Between = "Pause between functions",
        NextComponent = "Drawing next component function",
        AddVertical = "Adding vertical lines from x-axis to component function",
        MoveVertical = "Moving vertical lines to partial sum function",
        NewPartialSum = "Drawing new partial sum",
        Fadeout = "Fading old lines away"
    }

    const nextPhase: Record<Phase, Phase> = {
        [Phase.Between]:       Phase.NextComponent,
        [Phase.NextComponent]: Phase.AddVertical,
        [Phase.AddVertical]:   Phase.MoveVertical,
        [Phase.MoveVertical]:  Phase.NewPartialSum,
        [Phase.NewPartialSum]: Phase.Fadeout,
        [Phase.Fadeout]:       Phase.Between
    };

    // Constants
    const X_MIN = -6;
    const X_MAX = 6;
    const Y_MIN = -2;
    const Y_MAX = 2;
    const N_SAMPLES = 1000;
    const L = 1; // Fourier limits from 0 to L = 1.

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
    let segmentsDrawn = 0;
    let currentFunctionSegments = Infinity;
    let currentFourierN = 0;
    let partialFourierSum: FunctionAndCoordinates = {fn: (x) => 0, coordinates: []};
    let currentFourierComponentFunction: (x: number) => number = (x) => 0;
    let currentFourierComponent: FunctionAndCoordinates = {fn: (x) => 0, coordinates: []};
    let animationPhase = Phase.Between;

    // ---- Animation loop ----
    function animate(time: number) {
        const deltaTime = (time - lastTime) * 0.001; // seconds
        lastTime = time;
        if (animationPhase === Phase.Between)
            incrementPhase();
        else if (animationPhase === Phase.NextComponent) {
            if (segmentsDrawn < currentFunctionSegments - 1)
                segmentsDrawn += 1;
            else {
                if (currentFourierN === 1) {
                    setPhase(Phase.Between)
                    partialFourierSum.fn = currentFourierComponent.fn;
                    partialFourierSum.coordinates = currentFourierComponent.coordinates;
                    currentFourierN += 1;
                    segmentsDrawn = 0;
                    currentFourierComponentFunction = (x) => fourierSine(x, currentFourierN);
                    currentFourierComponent = {fn: currentFourierComponentFunction, coordinates: getXYPairs(currentFourierComponentFunction)};
                    currentFunctionSegments = currentFourierComponent.coordinates.length;
                }
                else {
                    // TODO: Get correct new partial Fourier function and calculate coordinates with it.
                    incrementPhase();
                }
            }
        }
        else if (animationPhase === Phase.AddVertical) {

        }

        setStatus("Segments drawn:  " + segmentsDrawn);
        update(deltaTime);
        render(segmentsDrawn);

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

    function drawFunctionOfX(coordinates: Point[], numSegments: number, color: string): void {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;

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
    function render(numSegments: number): void {
        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        drawAxes();
        drawF();
        if (partialFourierSum.coordinates.length > 0)
            drawFunctionOfX(partialFourierSum.coordinates, partialFourierSum.coordinates.length, "#3d7");

        drawFunctionOfX(currentFourierComponent.coordinates, numSegments, "#6cf");
    }

    // ---- Kick things off ----
    currentFourierN = 1;
    currentFourierComponentFunction = (x) => fourierSine(x, currentFourierN);
    currentFourierComponent = {fn: currentFourierComponentFunction, coordinates: getXYPairs(currentFourierComponentFunction)};
    currentFunctionSegments = currentFourierComponent.coordinates.length;
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
        return (n % 2 === 0 ? -1 : 1) * (2 * L / (n * Math.PI)) * Math.sin(n * Math.PI * x / L);
    }

    function getXYPairs(f: (x: number) => number): Point[] {
        const coordinates: Point[] = [];
        for (let i = 0; i < N_SAMPLES; ++i) {
            const xi = X_MIN + i * (X_MAX - X_MIN)/(N_SAMPLES - 1);
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
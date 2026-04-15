    // ===============================
    // main.ts
    // Entry point for the application
    // ===============================

    import { create, all, type MathNode, type EvalFunction } from "mathjs";
    const math = create(all!);
    import katex from "katex";
    import "katex/dist/katex.min.css";
    import renderMathInElement from "katex/contrib/auto-render";

    const mathRenderingOptions = {
        delimiters: [
            { left: "\\$$", right: "\\$$", display: true },
            { left: "\\$", right: "\\$", display: false }
        ]
    };
    renderMathInElement(document.body, mathRenderingOptions);

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
    };

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

    enum AnimationMode {
        Continuous = "Continuous",
        ByTerm = "Pause between terms",
        ByPhase = "Pause between phases"
    };

    const animationModeMap: Record<string, AnimationMode> = {
        "Continuous": AnimationMode.Continuous,
        "ByTerm": AnimationMode.ByTerm,
        "ByPhase": AnimationMode.ByPhase
    };

    enum Speed {
        OneHalf = "&frac12;&times;",
        ThreeQuarters = "&frac34;&times;",
        One = "1&times;",
        OneAndOneHalf = "1&frac12;&times;",
        Two = "2&times;",
        Three = "3&times;",
        Five = "5&times;"
    };

    const speeds: Speed[] = [Speed.OneHalf, Speed.ThreeQuarters, Speed.One, Speed.OneAndOneHalf, Speed.Two, Speed.Three, Speed.Five];
    var currentSpeedIndex: number = 2;

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
    const GRAPH_DRAW_TIME = 6;
    const VERTICAL_BAR_DRAW_TIME = 2;
    const VERTICAL_BAR_MOVE_TIME = 2;
    const FADEOUT_TIME = 2;
    const COUNT_0_TO_L_SAMPLES = 501;

    // ---- Grab DOM elements ----
    function getElementOrThrow<T extends HTMLElement>(id: string, type: { new(): T }): T {
        const element = document.getElementById(id);
        if (!(element instanceof type)) {
            throw new Error(`Element #${id} not found or wrong type`);
        }
        return element;
    }

    // Buttons
    const speedDownButton = getElementOrThrow("speedMinus", HTMLButtonElement);
    const speedUpButton = getElementOrThrow("speedPlus", HTMLButtonElement);
    const modeSetButton = getElementOrThrow("modeSet", HTMLButtonElement);
    const continueButton = getElementOrThrow("continueButton", HTMLButtonElement);
    const fxSubmitButton = getElementOrThrow("functionSubmit", HTMLButtonElement);

    // Other HTML Elements
    const canvas = getElementOrThrow("graph", HTMLCanvasElement);
    const speedText = getElementOrThrow("speedText", HTMLSpanElement);
    const modeSelect = getElementOrThrow("modeSelection", HTMLSelectElement);
    const fxInputTextBox = getElementOrThrow("functionInputTextBox", HTMLInputElement);
    const fxDisplay = getElementOrThrow("functionDisplay", HTMLParagraphElement);

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) {
        throw new Error("2D canvas context not available");
    }
    const ctx = ctx2d;

    speedDownButton.addEventListener("click", () => {
        if (currentSpeedIndex > 0)
            currentSpeedIndex -= 1;
        speedText.innerHTML = speeds[currentSpeedIndex] ?? Speed.One;
        speedUpButton.disabled = false;
        if (currentSpeedIndex === 0)
            speedDownButton.disabled = true;
    })

    speedUpButton.addEventListener("click", () => {
        if (currentSpeedIndex < speeds.length - 1)
            currentSpeedIndex += 1;
        speedText.innerHTML = speeds[currentSpeedIndex] ?? Speed.One;
        speedDownButton.disabled = false;
        if (currentSpeedIndex === speeds.length - 1)
            speedUpButton.disabled = true;
    })

    modeSelect.addEventListener("change", () => {
        const selectedMode: string = modeSelect.value;
        modeSetButton.disabled = ((animationModeMap[selectedMode] ?? animationMode) === animationMode);
    })
    
    modeSetButton.addEventListener("click", () => {
        const selectedMode: string = modeSelect.value;
        animationMode = animationModeMap[selectedMode] ?? AnimationMode.ByTerm;
        modeSetButton.disabled = true;
    });

    continueButton.addEventListener("click", () => {
        if (animationPhase === Phase.Between)
            incrementPhase();
        continueButton.textContent = "Running animation for \\$n = " + currentFourierN + "\\$...";
        renderMathInElement(continueButton, mathRenderingOptions);
        continueButton.disabled = true;
    });

    fxSubmitButton.addEventListener("click", () => {
        const expression = fxInputTextBox.value;
        console.log("User entered:", expression);

        onFunctionSubmit(expression);
    });

    function onFunctionSubmit(expression: string): void {
        if (animationId !== null)
            cancelAnimationFrame(animationId);
        resetValues();
        fString = expression;
        fCoordinates = getFCoordinates(X_MIN, X_MAX, COUNT_SAMPLES)
        f0ToLCoordinates = getFCoordinates(0, L, COUNT_0_TO_L_SAMPLES)
        const expr: MathNode = math.parse(fString);
        katex.render("f(x) =" + expr.toTex(), fxDisplay);
        kickThingsOff();
    }

    // Optional status line
    const statusElement = document.getElementById("status");

    // --- Control panel variables
    let animationMode = AnimationMode.ByTerm;

    // ---- State-tracking variables ----
    let lastTime = 0;
    let animationId: number | null = null;
    let fString = "";
    let fCoordinates: Point[] = []
    let f0ToLCoordinates: Point[] = [];
    let currentFunctionSegmentsDrawn = 0;
    let currentFunctionSegments = Infinity;
    let newPartialFourierSumSegmentsDrawn = 0;
    let newPartialFourierSumSegments = Infinity;
    let verticalBarSegmentsChecked = 0;
    let currentFourierN = 0;
    let partialFourierSumCoordinates: Point[] = [];
    let newPartialFourierSumCoordinates: Point[] = [];
    let currentFourierComponentFunction: (x: number) => number = (x) => 0;
    let currentFourierComponentCoordinates: Point[] = [];
    let verticalBarAnimationTime = 0;
    let fadeout1Time = 0;
    let fadeout2Time = 0;
    let animationPhase = Phase.Between;
    drawAxes();

    // ---- Animation loop ----
    function animate(time: number) {
        const deltaTime = (time - lastTime) * 0.001; // seconds
        lastTime = time;

        switch(animationPhase) {
            case Phase.Between:
                switch (animationMode) {
                    case AnimationMode.Continuous:
                        incrementPhase();
                        break;
                    case AnimationMode.ByTerm:
                    case AnimationMode.ByPhase:
                        continueButton.disabled = false;
                        continueButton.textContent = currentFourierN < 2 ? "Start animation" : "Continue animation for \\$n = " + currentFourierN + "\\$";
                        renderMathInElement(continueButton, mathRenderingOptions);
                        //incrementPhase();
                        break;
                }
                break;

            case Phase.NextComponent:
                currentFunctionSegmentsDrawn += currentFunctionSegments / GRAPH_DRAW_TIME * deltaTime;
                if (currentFunctionSegmentsDrawn >= currentFunctionSegments) {
                    currentFunctionSegmentsDrawn = currentFunctionSegments;
                    if (currentFourierN === 1) {
                        partialFourierSumCoordinates = currentFourierComponentCoordinates;
                        setPhase(Phase.FadeoutFirstLoop);
                    }
                    else {
                        // TODO: Get correct new partial Fourier function and calculate coordinates with it. (Actually do this in a later phase; we need this after MoveVertical)
                        incrementPhase();
                    }
                }
                break;

            case Phase.AddVertical:
                verticalBarSegmentsChecked += currentFunctionSegments / VERTICAL_BAR_DRAW_TIME * deltaTime;
                if (verticalBarSegmentsChecked >= currentFunctionSegments - VERTICAL_BAR_STEP) {
                    verticalBarSegmentsChecked = currentFunctionSegments - VERTICAL_BAR_STEP;
                    incrementPhase();
                }
                break;

            case Phase.Fadeout1:
                fadeout1Time += deltaTime;
                if (fadeout1Time >= FADEOUT_TIME) {
                    fadeout1Time = FADEOUT_TIME;
                    currentFunctionSegmentsDrawn = 0;
                    fadeout1Time = 0;
                    incrementPhase();
                }
                break;

            case Phase.MoveVertical:
                verticalBarAnimationTime += deltaTime;
                if (verticalBarAnimationTime >= VERTICAL_BAR_MOVE_TIME) {
                    verticalBarAnimationTime = VERTICAL_BAR_MOVE_TIME;
                    newPartialFourierSumCoordinates = partialFourierSumCoordinates.map((point, i) => ({x: point.x, y: point.y + currentFourierComponentCoordinates[i]!.y}));
                    newPartialFourierSumSegments = newPartialFourierSumCoordinates.length;
                    incrementPhase();
                }
                break;

            case Phase.NewPartialSum:
                newPartialFourierSumSegmentsDrawn += newPartialFourierSumSegments / GRAPH_DRAW_TIME * deltaTime;
                if (newPartialFourierSumSegmentsDrawn >= newPartialFourierSumSegments) {
                    newPartialFourierSumSegmentsDrawn = newPartialFourierSumSegments;
                    incrementPhase();
                }
                break;

            case Phase.Fadeout2:
                fadeout2Time += deltaTime;
                if (fadeout2Time >= FADEOUT_TIME) {
                    fadeout2Time = FADEOUT_TIME;
                    currentFourierN += 1;
                    currentFunctionSegmentsDrawn = 0;
                    currentFourierComponentFunction = (x) => fourierSine(x, currentFourierN);
                    currentFourierComponentCoordinates = getXYPairs(currentFourierComponentFunction, X_MIN, X_MAX, COUNT_SAMPLES);
                    currentFunctionSegments = currentFourierComponentCoordinates.length;
                    verticalBarAnimationTime = 0;
                    verticalBarSegmentsChecked = VERTICAL_BAR_OFFSET;
                    fadeout2Time = 0;
                    partialFourierSumCoordinates = newPartialFourierSumCoordinates;
                    newPartialFourierSumSegmentsDrawn = 0;
                    newPartialFourierSumCoordinates = [];
                    incrementPhase();
                }
                break;

            case Phase.FadeoutFirstLoop:
                currentFunctionSegmentsDrawn = currentFourierComponentCoordinates.length;
                newPartialFourierSumSegmentsDrawn = newPartialFourierSumCoordinates.length;
                fadeout1Time += deltaTime;
                if (fadeout1Time >= FADEOUT_TIME) {
                    currentFourierN += 1;
                    currentFunctionSegmentsDrawn = 0;
                    currentFourierComponentFunction = (x) => fourierSine(x, currentFourierN);
                    currentFourierComponentCoordinates = getXYPairs(currentFourierComponentFunction, X_MIN, X_MAX, COUNT_SAMPLES);
                    currentFunctionSegments = currentFourierComponentCoordinates.length;
                    fadeout1Time = 0;
                    incrementPhase();
                }
                break;
        }

        // setStatus("Segments drawn:  " + currentFunctionSegmentsDrawn);
        update(deltaTime);
        render();

        animationId = requestAnimationFrame(animate);
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
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#bbb";
        ctx.beginPath();
        ctx.moveTo(mapX(X_MIN), mapY(0));
        ctx.lineTo(mapX(X_MAX), mapY(0));
        ctx.moveTo(mapX(0), mapY(Y_MIN));
        ctx.lineTo(mapX(0), mapY(Y_MAX));
        const xTickStart = mapY(0);
        const yTickStart = mapX(0);
        const tickLength = 10;
        for (let tick = Math.trunc(X_MIN); tick <= Math.trunc(X_MAX); ++tick) {
            if (tick !== 0) {
                ctx.moveTo(mapX(tick), xTickStart);
                ctx.lineTo(mapX(tick), xTickStart - tickLength);
            }
        }
        for (let tick = Math.trunc(Y_MIN); tick <= Math.trunc(Y_MAX); ++tick) {
            if (tick !== 0) {
                ctx.moveTo(yTickStart, mapY(tick));
                ctx.lineTo(yTickStart + tickLength, mapY(tick));
            }
        }
        ctx.stroke();
        ctx.restore();
    }

    function getFCoordinates(xMin: number, xMax: number, numberOfPoints: number) : Point[] {
        const expression: MathNode = math.parse(fString);
        const compiledExpression: EvalFunction = expression.compile();
        return getXYPairs((x) => compiledExpression.evaluate({ x }), xMin, xMax, numberOfPoints);
    }

    function drawFunctionOfX(coordinates: Point[], numSegments: number, color: string, alpha: number): void {
        numSegments = math.round(numSegments);
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
        const distanceToMove = partialSumFunctionPoint.y * Math.min(verticalBarAnimationTime / VERTICAL_BAR_MOVE_TIME, 1);
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
        drawFunctionOfX(fCoordinates, fCoordinates.length, "#d70", 1);
        let fadeout1Alpha = Math.max(1 - fadeout1Time / FADEOUT_TIME, 0);
        let fadeout2Alpha = Math.max(1 - fadeout2Time / FADEOUT_TIME, 0);
        if (partialFourierSumCoordinates.length > 0)
            drawFunctionOfX(partialFourierSumCoordinates, partialFourierSumCoordinates.length, "#3d7", fadeout2Alpha);

        drawFunctionOfX(currentFourierComponentCoordinates, currentFunctionSegmentsDrawn, "#6cf", fadeout1Alpha);

        for (let verticalBarIndex = 0; verticalBarIndex <= verticalBarSegmentsChecked; verticalBarIndex += 1) {
            if (verticalBarIndex % VERTICAL_BAR_STEP !== VERTICAL_BAR_OFFSET)
                continue;
            // TODO: Change this to only draw a bar if verticalBarIndex % VERTICAL_BAR_STEP === VERTICAL_BAR_OFFSET but the loop increases by 1 each time
            // This keeps the animation speed slower, matching the speed of drawing the graphs of the functions
            const componentFunctionPoint = currentFourierComponentCoordinates[verticalBarIndex];
            const partialSumFunctionPoint = partialFourierSumCoordinates[verticalBarIndex];
            if (componentFunctionPoint !== undefined && partialSumFunctionPoint !== undefined)
                drawVerticalBar(componentFunctionPoint, partialSumFunctionPoint, fadeout2Alpha)
        }

        if (newPartialFourierSumCoordinates.length > 0) {
            if (fadeout2Time > 0)
                drawFunctionOfX(newPartialFourierSumCoordinates, newPartialFourierSumSegmentsDrawn, "#3d7", 1);
            drawFunctionOfX(newPartialFourierSumCoordinates, newPartialFourierSumSegmentsDrawn, "#91b", fadeout2Alpha);
        }
    }

    // ---- Kick things off ----
    function kickThingsOff() {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        setPhase(Phase.Between)
        currentFourierN = 1;
        currentFourierComponentFunction = (x) => fourierSine(x, currentFourierN);
        currentFourierComponentCoordinates = getXYPairs(currentFourierComponentFunction, X_MIN, X_MAX, COUNT_SAMPLES);
        currentFunctionSegments = currentFourierComponentCoordinates.length;
        verticalBarSegmentsChecked = VERTICAL_BAR_OFFSET;
        requestAnimationFrame(animate);
    }

    function resetValues() {
        currentFunctionSegmentsDrawn = 0;
        newPartialFourierSumSegmentsDrawn = 0;
        verticalBarSegmentsChecked = 0;
        verticalBarAnimationTime = 0;
        currentFourierN = 0;
        fadeout1Time = 0;
        fadeout2Time = 0;
        partialFourierSumCoordinates = [];
        newPartialFourierSumCoordinates = [];
        currentFourierComponentFunction = (x) => 0;
        currentFourierComponentCoordinates = [];
    }

    // ---- Debug helper (optional) ----
    function setStatus(text: string): void {
        if (statusElement) statusElement.textContent = text;
    }

    setStatus("Initialized");

    function fourierSine(x: number, n: number): number {
        return fourierTermCoefficient(f0ToLCoordinates, n) * Math.sin(n * Math.PI * x / L);
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
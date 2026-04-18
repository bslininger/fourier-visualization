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
        Between = "Pause between terms",
        NextComponent = "Drawing next component function",
        BetweenPhases1 = "Pause after NextComponent phase",
        AddVertical = "Adding vertical lines from x-axis to component function",
        Fadeout1 = "Fading component function away",
        BetweenPhases2 = "Pause after Fadeout1 phase",
        MoveVertical = "Moving vertical lines to partial sum function",
        BetweenPhases3 = "Pause after MoveVertical phase",
        NewPartialSum = "Drawing new partial sum",
        Fadeout2 = "Fading old partial sum and vertical lines away",
        FadeoutFirstLoop = "Fading first component function into the partial sum's color"
    };

    const nextPhase: Record<Phase, Phase> = {
        [Phase.Between]:          Phase.NextComponent,
        [Phase.NextComponent]:    Phase.BetweenPhases1,
        [Phase.BetweenPhases1]:   Phase.AddVertical,
        [Phase.AddVertical]:      Phase.Fadeout1,
        [Phase.Fadeout1]:         Phase.BetweenPhases2,
        [Phase.BetweenPhases2]:   Phase.MoveVertical,
        [Phase.MoveVertical]:     Phase.BetweenPhases3,
        [Phase.BetweenPhases3]:   Phase.NewPartialSum,
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
    const speedToNumberMap: Record<Speed, number> = {
        [Speed.OneHalf]: 0.5,
        [Speed.ThreeQuarters]: 0.75,
        [Speed.One]: 1,
        [Speed.OneAndOneHalf]: 1.5,
        [Speed.Two]: 2,
        [Speed.Three]: 3,
        [Speed.Five]: 5
    };
    var currentSpeedIndex: number = 2;

    // Constants
    const X_LARGEST_MAGNITUDE = 20;
    const Y_LARGEST_MAGNITUDE = 20;
    const X_SMALLEST_MAGNITUDE = 0.1;
    const Y_SMALLEST_MAGNITUDE = 0.1;
    const X_STARTING_MAGNITUDE = 2;
    const Y_STARTING_MAGNITUDE = 2;
    const COUNT_SAMPLES = 1000;
    const L = 1; // Fourier limits from 0 to L = 1.
    const VERTICAL_BAR_OFFSET = 2; // Offset the first bar a bit from the left side of the canvas
    const VERTICAL_BAR_STEP = 5;
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
    const rangeSetButton = getElementOrThrow("rangeSubmit", HTMLButtonElement);
    const continueButton = getElementOrThrow("continueButton", HTMLButtonElement);
    const fxSubmitButton = getElementOrThrow("functionSubmit", HTMLButtonElement);

    // Other HTML Elements
    const canvas = getElementOrThrow("graph", HTMLCanvasElement);
    const speedText = getElementOrThrow("speedText", HTMLSpanElement);
    const modeSelect = getElementOrThrow("modeSelection", HTMLSelectElement);
    const xMinInput = getElementOrThrow("xMin", HTMLInputElement);
    const xMaxInput = getElementOrThrow("xMax", HTMLInputElement);
    const yMinInput = getElementOrThrow("yMin", HTMLInputElement);
    const yMaxInput = getElementOrThrow("yMax", HTMLInputElement);
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
        animationMode = animationModeMap[selectedMode] ?? AnimationMode.ByTerm;
    })

    rangeSetButton.addEventListener("click", () => {
        xMin = validatedRangeInput(xMinInput.valueAsNumber, -X_LARGEST_MAGNITUDE, -X_SMALLEST_MAGNITUDE, xMin);
        xMax = validatedRangeInput(xMaxInput.valueAsNumber, X_SMALLEST_MAGNITUDE, X_LARGEST_MAGNITUDE, xMax);
        yMin = validatedRangeInput(yMinInput.valueAsNumber, -Y_LARGEST_MAGNITUDE, -Y_SMALLEST_MAGNITUDE, yMin);
        yMax = validatedRangeInput(yMaxInput.valueAsNumber, Y_SMALLEST_MAGNITUDE, Y_LARGEST_MAGNITUDE, yMax);
        xMinInput.valueAsNumber = xMin;
        xMaxInput.valueAsNumber = xMax;
        yMinInput.valueAsNumber = yMin;
        yMaxInput.valueAsNumber = yMax;
        if (animationPhase === Phase.Between && fCoordinates.length !== 0)
                fCoordinates = getFCoordinates(xMin, xMax, COUNT_SAMPLES)
    });

    function validatedRangeInput(enteredValue: number, minAllowed: number, maxAllowed: number, fallbackValue: number): number {
        if (minAllowed > maxAllowed)
            throw new Error("validatedRangeInput: minAllowed > maxAllowed");
        if (Number.isNaN(enteredValue))
            return fallbackValue;
        if (enteredValue < minAllowed)
            return minAllowed;
        if (enteredValue > maxAllowed)
            return maxAllowed;
        return enteredValue;
    }

    continueButton.addEventListener("click", () => {
        if (animationPhase === Phase.Between || (animationMode === AnimationMode.ByPhase && [Phase.BetweenPhases1, Phase.BetweenPhases2, Phase.BetweenPhases3].includes(animationPhase))) {
            if (currentFourierN < 2) {
                currentFourierComponentFunction = (x) => fourierSine(x, currentFourierN);
                currentFourierComponentCoordinates = getXYPairs(currentFourierComponentFunction, xMin, xMax, COUNT_SAMPLES);
                currentFunctionSegments = currentFourierComponentCoordinates.length;
            }
            incrementPhase();
            continueButton.textContent = "Running animation...";
            renderMathInElement(continueButton, mathRenderingOptions);
            xMinInput.disabled = true;
            xMinInput.valueAsNumber = xMin;
            xMaxInput.disabled = true;
            xMaxInput.valueAsNumber = xMax;
            continueButton.disabled = true;
        }
    });

    fxSubmitButton.addEventListener("click", () => {
        const expression = fxInputTextBox.value;
        onFunctionSubmit(expression);
    });

    function onFunctionSubmit(expression: string): void {
        if (animationId !== null)
            cancelAnimationFrame(animationId);
        resetValues();
        fString = expression;
        fCoordinates = getFCoordinates(xMin, xMax, COUNT_SAMPLES)
        f0ToLCoordinates = getFCoordinates(0, L, COUNT_0_TO_L_SAMPLES)
        xMax = 2 * L;
        xMin = -xMax;
        let yMin0ToL = Math.min(-Y_STARTING_MAGNITUDE, ...f0ToLCoordinates.map(point => point.y));
        let yMax0ToL = Math.max(Y_STARTING_MAGNITUDE, ...f0ToLCoordinates.map(point => point.y));
        let yMagnitude = Math.min(20, Math.max(-(yMin0ToL - 1), yMax0ToL + 1));
        yMin = -yMagnitude;
        yMax = yMagnitude;
        xMinInput.valueAsNumber = xMin;
        xMinInput.disabled = false;
        xMaxInput.valueAsNumber = xMax;
        xMaxInput.disabled = false;
        yMinInput.valueAsNumber = yMin;
        yMinInput.disabled = false;
        yMaxInput.valueAsNumber = yMax;
        yMaxInput.disabled = false;
        rangeSetButton.disabled = false;
        const expr: MathNode = math.parse(fString);
        katex.render("f(x) =" + expr.toTex(), fxDisplay);
        kickThingsOff();
    }

    // Optional status line
    const statusElement = document.getElementById("status");

    // --- Control panel variables
    let animationMode = AnimationMode.ByTerm;
    let xMin = -X_STARTING_MAGNITUDE;
    let xMax = X_STARTING_MAGNITUDE;
    let yMin = -Y_STARTING_MAGNITUDE;
    let yMax = Y_STARTING_MAGNITUDE;

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
    let fadeout1TimeElapsed = 0;
    let fadeout2TimeElapsed = 0;
    let animationPhase = Phase.Between;
    drawAxes();

    // ---- Animation loop ----
    function animate(time: number) {
        const deltaTime = (time - lastTime) * 0.001; // seconds
        lastTime = time;
        update(deltaTime);
        render();
        animationId = requestAnimationFrame(animate);
    }

    // Handle state changes and determine what should get drawn at the current time
    function update(deltaTime: number): void {
        let speedFactor = speedToNumberMap[speeds[currentSpeedIndex] ?? Speed.One];

        switch(animationPhase) {
            case Phase.Between:
                switch (animationMode) {
                    case AnimationMode.Continuous:
                        if (currentFourierN < 2) {
                            // Animation hasn't started at all yet, don't start it until the start button is clicked
                            continueButton.disabled = false;
                            continueButton.textContent = "Start animation";
                        }
                        else
                            incrementPhase();
                        break;
                    case AnimationMode.ByTerm:
                    case AnimationMode.ByPhase:
                        continueButton.disabled = false;
                        continueButton.textContent = currentFourierN < 2 ? "Start animation" : "Continue animation";
                        break;
                }
                break;

            case Phase.NextComponent:
                currentFunctionSegmentsDrawn += currentFunctionSegments / GRAPH_DRAW_TIME * speedFactor * deltaTime;
                if (currentFunctionSegmentsDrawn >= currentFunctionSegments) {
                    currentFunctionSegmentsDrawn = currentFunctionSegments;
                    if (currentFourierN === 1) {
                        partialFourierSumCoordinates = currentFourierComponentCoordinates;
                        setPhase(Phase.FadeoutFirstLoop);
                    }
                    else
                        incrementPhase();
                }
                break;

            case Phase.BetweenPhases1:
            case Phase.BetweenPhases2:
            case Phase.BetweenPhases3:
                switch (animationMode) {
                    case AnimationMode.Continuous:
                    case AnimationMode.ByTerm:
                        incrementPhase();
                        break;
                    case AnimationMode.ByPhase:
                        continueButton.disabled = false;
                        continueButton.textContent = "Continue animation";
                        break;
                }
                break;

            case Phase.AddVertical:
                verticalBarSegmentsChecked += currentFunctionSegments / VERTICAL_BAR_DRAW_TIME * speedFactor * deltaTime;
                if (verticalBarSegmentsChecked >= currentFunctionSegments - VERTICAL_BAR_STEP) {
                    verticalBarSegmentsChecked = currentFunctionSegments - VERTICAL_BAR_STEP;
                    incrementPhase();
                }
                break;

            case Phase.Fadeout1:
                fadeout1TimeElapsed += speedFactor * deltaTime;
                if (fadeout1TimeElapsed >= FADEOUT_TIME) {
                    fadeout1TimeElapsed = FADEOUT_TIME;
                    currentFunctionSegmentsDrawn = 0;
                    fadeout1TimeElapsed = 0;
                    incrementPhase();
                }
                break;

            case Phase.MoveVertical:
                verticalBarAnimationTime += speedFactor * deltaTime;
                if (verticalBarAnimationTime >= VERTICAL_BAR_MOVE_TIME) {
                    verticalBarAnimationTime = VERTICAL_BAR_MOVE_TIME;
                    newPartialFourierSumCoordinates = partialFourierSumCoordinates.map((point, i) => ({x: point.x, y: point.y + currentFourierComponentCoordinates[i]!.y}));
                    newPartialFourierSumSegments = newPartialFourierSumCoordinates.length;
                    incrementPhase();
                }
                break;

            case Phase.NewPartialSum:
                newPartialFourierSumSegmentsDrawn += newPartialFourierSumSegments / GRAPH_DRAW_TIME * speedFactor * deltaTime;
                if (newPartialFourierSumSegmentsDrawn >= newPartialFourierSumSegments) {
                    newPartialFourierSumSegmentsDrawn = newPartialFourierSumSegments;
                    incrementPhase();
                }
                break;

            case Phase.Fadeout2:
                fadeout2TimeElapsed += speedFactor * deltaTime;
                if (fadeout2TimeElapsed >= FADEOUT_TIME) {
                    fadeout2TimeElapsed = FADEOUT_TIME;
                    currentFourierN += 1;
                    currentFunctionSegmentsDrawn = 0;
                    currentFourierComponentFunction = (x) => fourierSine(x, currentFourierN);
                    currentFourierComponentCoordinates = getXYPairs(currentFourierComponentFunction, xMin, xMax, COUNT_SAMPLES);
                    currentFunctionSegments = currentFourierComponentCoordinates.length;
                    verticalBarAnimationTime = 0;
                    verticalBarSegmentsChecked = 0;
                    fadeout2TimeElapsed = 0;
                    partialFourierSumCoordinates = newPartialFourierSumCoordinates;
                    newPartialFourierSumSegmentsDrawn = 0;
                    newPartialFourierSumCoordinates = [];
                    incrementPhase();
                }
                break;

            case Phase.FadeoutFirstLoop:
                currentFunctionSegmentsDrawn = currentFourierComponentCoordinates.length;
                newPartialFourierSumSegmentsDrawn = newPartialFourierSumCoordinates.length;
                fadeout1TimeElapsed += speedFactor * deltaTime;
                if (fadeout1TimeElapsed >= FADEOUT_TIME) {
                    currentFourierN += 1;
                    currentFunctionSegmentsDrawn = 0;
                    currentFourierComponentFunction = (x) => fourierSine(x, currentFourierN);
                    currentFourierComponentCoordinates = getXYPairs(currentFourierComponentFunction, xMin, xMax, COUNT_SAMPLES);
                    currentFunctionSegments = currentFourierComponentCoordinates.length;
                    fadeout1TimeElapsed = 0;
                    incrementPhase();
                }
                break;
        }
    }

    function drawAxes(): void {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#bbb";
        ctx.beginPath();
        ctx.moveTo(mapX(xMin), mapY(0));
        ctx.lineTo(mapX(xMax), mapY(0));
        ctx.moveTo(mapX(0), mapY(yMin));
        ctx.lineTo(mapX(0), mapY(yMax));
        const xTickStart = mapY(0);
        const yTickStart = mapX(0);
        const tickLength = 10;
        for (let tick = Math.trunc(xMin); tick <= Math.trunc(xMax); ++tick) {
            if (tick !== 0) {
                ctx.moveTo(mapX(tick), xTickStart);
                ctx.lineTo(mapX(tick), xTickStart - tickLength);
            }
        }
        for (let tick = Math.trunc(yMin); tick <= Math.trunc(yMax); ++tick) {
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

        const yOutsideRange = (y: number) => !Number.isFinite(y) || y < yMin || y > yMax;

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
                    const yBoundaryHit = previousCoordinate.y < yMin ? yMin : yMax;
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
                    const boundaryHitY = coordinate.y < yMin ? yMin : yMax;
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
        let fadeout1Alpha = Math.max(1 - fadeout1TimeElapsed / FADEOUT_TIME, 0);
        let fadeout2Alpha = Math.max(1 - fadeout2TimeElapsed / FADEOUT_TIME, 0);
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
            if (fadeout2TimeElapsed > 0)
                drawFunctionOfX(newPartialFourierSumCoordinates, newPartialFourierSumSegmentsDrawn, "#3d7", 1);
            drawFunctionOfX(newPartialFourierSumCoordinates, newPartialFourierSumSegmentsDrawn, "#91b", fadeout2Alpha);
        }
    }

    // ---- Kick things off ----
    function kickThingsOff() {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        setPhase(Phase.Between)
        currentFourierN = 1;
        requestAnimationFrame(animate);
    }

    function resetValues() {
        currentFunctionSegmentsDrawn = 0;
        newPartialFourierSumSegmentsDrawn = 0;
        verticalBarSegmentsChecked = 0;
        verticalBarAnimationTime = 0;
        currentFourierN = 0;
        fadeout1TimeElapsed = 0;
        fadeout2TimeElapsed = 0;
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
        return (x - xMin) / (xMax - xMin) * canvas.width;
    }

    function mapY(y: number): number {
        return (yMax - y) / (yMax - yMin) * canvas.height;  // Flipped sign
    }
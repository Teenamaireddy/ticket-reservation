/**
 * =====================================
 * DJGST AI Core
 * Main Coordinator
 * =====================================
 */

import findNearbyRoutes from "../services/firestore-nearby-route-search.js";
import busSearch from "../services/firestore-bus-search.js";

import intentEngine from "./intent-engine.js";
import entityEngine from "./entity-engine.js";
import slotEngine from "../slots/slot-engine.js";
import memoryStore from "../memory/memory-store.js";
import parseBus from "../utils/bus-parser.js";


class DJGSTAI {

    constructor() {

        console.log("🧠 DJGST AI Initialized");

    }


    async process(userMessage) {

        console.log("👤 User:", userMessage);


        // =====================================
        // STEP 0 : CURRENT MEMORY
        // =====================================

        let memory =
            memoryStore.getAll();

        const trimmedMessage =
            String(userMessage || "").trim();

        const lowerMessage =
            trimmedMessage.toLowerCase();


        // =====================================
        // STEP 0.5 : NEW EXPLICIT ROUTE
        // =====================================
        //
        // Example:
        //
        // Old:
        // Rajahmundry → Vizag
        //
        // New:
        // Samalkota → Vizag
        //
        // The new route must replace
        // the old route.
        // =====================================

        const hasExplicitRoute =
            /\bfrom\b[\s\S]*\bto\b/i.test(
                trimmedMessage
            );


        if (hasExplicitRoute) {

            console.log(
                "🔄 New explicit route detected."
            );


            // Clear old route state

            memoryStore.save(
                "from",
                null
            );

            memoryStore.save(
                "to",
                null
            );

            memoryStore.save(
                "availableBuses",
                []
            );

            memoryStore.save(
                "pendingNearbyRoutes",
                []
            );

            memoryStore.save(
                "selectedBus",
                null
            );

            memoryStore.save(
                "selectedSeat",
                null
            );

            memoryStore.save(
                "bookingStage",
                "start"
            );


            memory =
                memoryStore.getAll();

        }


        // =====================================
        // STEP 1 : NEARBY ROUTE CONFIRMATION
        // =====================================

        const pendingRoutes =
            memoryStore.get(
                "pendingNearbyRoutes"
            );


        const confirmationWords = [

            "yes",
            "yeah",
            "yep",
            "sure",
            "okay",
            "ok",
            "yes please",
            "check it",
            "check them",
            "check",
            "search it",
            "search them",
            "search",
            "go ahead",
            "do it",
            "please do",
            "please check"

        ];


        const wantsNearbyRoutes =
            confirmationWords.includes(
                lowerMessage
            );


        if (
            wantsNearbyRoutes &&
            Array.isArray(pendingRoutes) &&
            pendingRoutes.length > 0
        ) {

            memoryStore.save(
                "bookingStage",
                "nearby_route_selection"
            );


            let reply =
`👍 Sure! Here are the nearby route options:

`;


            pendingRoutes.forEach(
                (route, index) => {

                    reply +=
`${index + 1}. ${route.from} ➜ ${route.to}
📍 ${route.reason}

`;

                }
            );


            reply +=
`Reply with the route number you'd like me to search.`;


            return {

                intent: {
                    intent:
                        "select_nearby_route"
                },

                entities: {},

                memory:
                    memoryStore.getAll(),

                reply

            };

        }


        // =====================================
        // STEP 2 : NEARBY ROUTE NUMBER
        // =====================================

        if (
            memoryStore.get("bookingStage") ===
            "nearby_route_selection"
        ) {

            const routes =
                Array.isArray(pendingRoutes)
                    ? pendingRoutes
                    : [];


            if (
                /^[1-9]\d*$/.test(
                    trimmedMessage
                )
            ) {

                const routeNumber =
                    Number(trimmedMessage);


                if (
                    routeNumber >= 1 &&
                    routeNumber <= routes.length
                ) {

                    const selectedRoute =
                        routes[
                            routeNumber - 1
                        ];


                    console.log(
                        "📍 Selected nearby route:",
                        selectedRoute
                    );


                    // ---------------------------------
                    // SAVE SELECTED ROUTE
                    // ---------------------------------

                    memoryStore.save(
                        "from",
                        selectedRoute.from
                    );

                    memoryStore.save(
                        "to",
                        selectedRoute.to
                    );


                    // ---------------------------------
                    // Clear old suggestions
                    // ---------------------------------

                    memoryStore.save(
                        "pendingNearbyRoutes",
                        []
                    );


                    // ---------------------------------
                    // Use buses returned by nearby
                    // route service if available.
                    // ---------------------------------

                    const buses =
                        Array.isArray(
                            selectedRoute.buses
                        )
                            ? selectedRoute.buses
                            : [];


                    // ---------------------------------
                    // If nearby service did not attach
                    // buses, search Firestore directly.
                    // ---------------------------------

                    let finalBuses =
                        buses;


                    if (
                        finalBuses.length === 0
                    ) {

                        finalBuses =
                            await busSearch.search(
                                memoryStore.getAll()
                            );

                    }


                    // ---------------------------------
                    // No buses
                    // ---------------------------------

                    if (
                        !Array.isArray(finalBuses) ||
                        finalBuses.length === 0
                    ) {

                        memoryStore.save(
                            "bookingStage",
                            "start"
                        );


                        return {

                            intent: {
                                intent:
                                    "select_nearby_route"
                            },

                            entities: {},

                            memory:
                                memoryStore.getAll(),

                            reply:
`😔 Sorry!

I couldn't find buses for:

📍 ${selectedRoute.from}
➜ ${selectedRoute.to}

Let's try another route.`

                        };

                    }


                    // ---------------------------------
                    // Save buses
                    // ---------------------------------

                    memoryStore.save(
                        "availableBuses",
                        finalBuses
                    );


                    memoryStore.save(
                        "bookingStage",
                        "bus_selection"
                    );


                    // ---------------------------------
                    // Display buses
                    // ---------------------------------

                    let reply =
`✅ Route selected!

📍 ${selectedRoute.from}
➜ ${selectedRoute.to}

🚌 I found ${finalBuses.length} buses:

`;


                    finalBuses.forEach(
                        (bus, index) => {

                            reply +=
`${index + 1}. ${bus.name}
🛏 ${bus.type}
🕒 ${bus.departure} → ${bus.arrival}
💰 ₹${bus.price}

`;

                        }
                    );


                    reply +=
`Reply with:

• Bus number
OR
• Bus name

Example:
1
Orange Travels
Book VRL`;


                    return {

                        intent: {
                            intent:
                                "book_ticket"
                        },

                        entities: {},

                        memory:
                            memoryStore.getAll(),

                        reply

                    };

                }


                return {

                    intent: {
                        intent:
                            "select_nearby_route"
                    },

                    entities: {},

                    memory:
                        memoryStore.getAll(),

                    reply:
`❌ Invalid route number.

Please choose a number from 1 to ${routes.length}.`

                };

            }


            return {

                intent: {
                    intent:
                        "select_nearby_route"
                },

                entities: {},

                memory:
                    memoryStore.getAll(),

                reply:
`📍 Please choose one of the nearby routes.

Reply with a number from 1 to ${routes.length}.`

            };

        }


        // =====================================
        // STEP 3 : BUS SELECTION
        // =====================================

        if (
            memoryStore.get("bookingStage") ===
            "bus_selection"
        ) {

            // =================================
            // 3A : NUMBER
            // =================================

            if (
                /^[1-9]\d*$/.test(
                    trimmedMessage
                )
            ) {

                const selectedBus =
                    parseBus(
                        trimmedMessage,
                        memoryStore.getAll()
                    );


                if (!selectedBus) {

                    return {

                        intent: {
                            intent:
                                "bus_selected"
                        },

                        entities: {},

                        memory:
                            memoryStore.getAll(),

                        reply:
`❌ Invalid bus number.

Please choose a valid bus.`

                    };

                }


                console.log(
                    "🚌 Selected bus:",
                    selectedBus
                );


                memoryStore.save(
                    "selectedBus",
                    selectedBus
                );


                memoryStore.save(
                    "bookingStage",
                    "seat_selection"
                );


                return {

                    intent: {
                        intent:
                            "bus_selected"
                    },

                    entities: {
                        selectedBus
                    },

                    memory:
                        memoryStore.getAll(),

                    reply:
`✅ ${selectedBus.name} selected.

💺 Opening Seat Selection...`

                };

            }


            // =================================
            // 3B : BUS NAME
            // =================================

            const selectedBusByName =
                parseBus(
                    trimmedMessage,
                    memoryStore.getAll()
                );


            if (selectedBusByName) {

                console.log(
                    "🚌 Selected bus by name:",
                    selectedBusByName
                );


                memoryStore.save(
                    "selectedBus",
                    selectedBusByName
                );


                memoryStore.save(
                    "bookingStage",
                    "seat_selection"
                );


                return {

                    intent: {
                        intent:
                            "bus_selected"
                    },

                    entities: {
                        selectedBus:
                            selectedBusByName
                    },

                    memory:
                        memoryStore.getAll(),

                    reply:
`✅ ${selectedBusByName.name} selected.

💺 Opening Seat Selection...`

                };

            }


            return {

                intent: {
                    intent:
                        "bus_selection"
                },

                entities: {},

                memory:
                    memoryStore.getAll(),

                reply:
`🚌 Please select a bus by:

• Bus number
OR
• Bus name

Example:
1
Orange Travels
Book VRL`

            };

        }


        // =====================================
        // STEP 4 : PREVIOUS DATE
        // =====================================

        let messageForProcessing =
            trimmedMessage;


        if (
            lowerMessage === "yes" &&
            memory.date
        ) {

            messageForProcessing =
                `${trimmedMessage} ${memory.date}`;

        }


        // =====================================
        // STEP 5 : DETECT INTENT
        // =====================================

        let intent =
            intentEngine.detect(
                messageForProcessing
            );


        // -------------------------------------
        // Continue previous intent
        // -------------------------------------

        if (
            intent.intent === "unknown" &&
            memory.intent
        ) {

            intent.intent =
                memory.intent;

        }


        // -------------------------------------
        // Save intent
        // -------------------------------------

        if (
            intent.intent !== "unknown"
        ) {

            memoryStore.save(
                "intent",
                intent.intent
            );

        }


        // =====================================
        // STEP 6 : ENTITY EXTRACTION
        // =====================================
        //
        // IMPORTANT:
        //
        // Pass MEMORY to Entity Engine.
        //
        // This allows:
        //
        // "Samalkota"
        //
        // to mean:
        //
        // from = Samalkota
        //
        // when AI is asking for FROM.
        // =====================================

        const entities =
            entityEngine.extract(
                messageForProcessing,
                memoryStore.getAll()
            );


        console.log(
            "📦 Entities:",
            entities
        );


        // =====================================
        // STEP 7 : SAVE ENTITIES
        // =====================================

        Object.entries(
            entities
        ).forEach(
            ([key, value]) => {

                if (
                    value !== null &&
                    value !== undefined &&
                    value !== ""
                ) {

                    memoryStore.save(
                        key,
                        value
                    );

                }

            }
        );


        memory =
            memoryStore.getAll();


        console.log(
            "🧠 Memory:",
            memory
        );


        // =====================================
        // STEP 8 : SLOT CHECKING
        // =====================================

        const slotResult =
            slotEngine.check(
                intent.intent,
                memory
            );


        console.log(
            "🎰 Slot Result:",
            slotResult
        );


        if (
            !slotResult.complete
        ) {

            switch (
                slotResult.missing
            ) {

                case "transport":

                    return {

                        intent,
                        entities,

                        memory,

                        reply:
`🚌 Which transport would you like to book?

Bus, Train or Flight?`

                    };


                case "from":

                    return {

                        intent,
                        entities,

                        memory,

                        reply:
`📍 Where are you travelling from?`

                    };


                case "to":

                    return {

                        intent,
                        entities,

                        memory,

                        reply:
`📍 Where are you travelling to?`

                    };


                case "date":

                    return {

                        intent,
                        entities,

                        memory,

                        reply:
`📅 What date would you like to travel?`

                    };

            }

        }


        // =====================================
        // STEP 9 : BOOKING
        // =====================================

        if (
            intent.intent ===
            "book_ticket"
        ) {

            const currentMemory =
                memoryStore.getAll();


            // =================================
            // BUS BOOKING
            // =================================

            if (
                currentMemory.transport ===
                "Bus"
            ) {

                console.log(
                    "🚌 Starting bus search..."
                );

                console.log(
                    "📍 Route:",
                    currentMemory.from,
                    "→",
                    currentMemory.to
                );


                const buses =
                    await busSearch.search(
                        currentMemory
                    );


                // =================================
                // NO DIRECT BUSES
                // =================================

                if (
                    !Array.isArray(buses) ||
                    buses.length === 0
                ) {

                    console.log(
                        `❌ No direct buses:
${currentMemory.from} → ${currentMemory.to}`
                    );


                    // ---------------------------------
                    // SEARCH NEARBY ROUTES
                    // ---------------------------------

                    const nearbyRoutes =
    await findNearbyRoutes(
        currentMemory.from,
        currentMemory.to
    );


// =====================================
// VERIFY NEARBY ROUTES
// =====================================
//
// IMPORTANT:
//
// findNearbyRoutes() may suggest a route,
// but we only want to show routes where
// Firestore actually contains active buses.
//
// Example:
//
// Rajahmundry → Vizag ❌
// Samalkota → Vizag ❌
//
// If Firestore has no buses for them,
// don't show them as alternatives.
//
// =====================================

let verifiedNearbyRoutes = [];


if (
    Array.isArray(nearbyRoutes) &&
    nearbyRoutes.length > 0
) {

    verifiedNearbyRoutes =
        (
            await Promise.all(

                nearbyRoutes.map(
                    async (route) => {

                        try {

                            const routeMemory = {

                                ...currentMemory,

                                from:
                                    route.from,

                                to:
                                    route.to

                            };


                            const routeBuses =
                                await busSearch.search(
                                    routeMemory
                                );


                            console.log(
                                "🔎 Nearby route verification:",
                                route.from,
                                "→",
                                route.to,
                                "Buses:",
                                routeBuses.length
                            );


                            // ---------------------------------
                            // KEEP ONLY ROUTES WITH REAL BUSES
                            // ---------------------------------

                            if (
                                Array.isArray(routeBuses) &&
                                routeBuses.length > 0
                            ) {

                                return {

                                    ...route,

                                    buses:
                                        routeBuses

                                };

                            }


                            // No buses → remove route

                            return null;

                        }

                        catch (error) {

                            console.error(
                                "❌ Nearby route verification failed:",
                                route,
                                error
                            );

                            return null;

                        }

                    }

                )

            )
        )
        .filter(
            route => route !== null
        );

}


console.log(
    "✅ Verified nearby routes:",
    verifiedNearbyRoutes
);


                    // ---------------------------------
                    // ALTERNATIVES FOUND
                    // ---------------------------------

                    if (
    Array.isArray(verifiedNearbyRoutes) &&
    verifiedNearbyRoutes.length > 0
) {

                        memoryStore.save(
    "pendingNearbyRoutes",
    verifiedNearbyRoutes
);


                        memoryStore.save(
                            "bookingStage",
                            "start"
                        );


                        let reply =
`😔 I couldn't find a direct bus for:

📍 ${currentMemory.from} ➜ ${currentMemory.to}

💡 But I found some nearby route options:

`;


                        verifiedNearbyRoutes.forEach(
                            (route, index) => {

                                reply +=
`${index + 1}. ${route.from} ➜ ${route.to}
📍 ${route.reason}

`;

                            }
                        );


                        reply +=
`Would you like me to search these nearby routes?

You can reply:
• Yes
• Yes please
• Check it
• Go ahead`;


                        return {

                            intent,
                            entities,

                            memory:
                                memoryStore.getAll(),

                            reply

                        };

                    }


                    // ---------------------------------
                    // NOTHING FOUND
                    // ---------------------------------

                    return {

                        intent,
                        entities,

                        memory:
                            currentMemory,

                        reply:
`😔 Sorry!

I couldn't find buses for:

📍 ${currentMemory.from} ➜ ${currentMemory.to}`

                    };

                }


                // =================================
                // DIRECT BUSES FOUND
                // =================================

                console.log(
                    `✅ Found ${buses.length} direct buses.`
                );


                memoryStore.save(
                    "availableBuses",
                    buses
                );


                memoryStore.save(
                    "bookingStage",
                    "bus_selection"
                );


                let reply =
`🚌 I found ${buses.length} buses.

`;


                buses.forEach(
                    (bus, index) => {

                        reply +=
`${index + 1}. ${bus.name}
🛏 ${bus.type}
🕒 ${bus.departure} → ${bus.arrival}
💰 ₹${bus.price}

`;

                    }
                );


                reply +=
`Reply with:

• Bus number
OR
• Bus name

Example:
1
Orange Travels
Book VRL`;


                return {

                    intent,
                    entities,

                    memory:
                        memoryStore.getAll(),

                    reply

                };

            }


            // =================================
            // TRAIN BOOKING
            // =================================

            if (
                currentMemory.transport ===
                "Train"
            ) {

                setTimeout(
                    () => {

                        window.location.href =
                            "trainapplication.html";

                    },
                    1500
                );


                return {

                    intent,
                    entities,

                    memory:
                        currentMemory,

                    reply:
`🚆 Opening Train Booking...`

                };

            }


            // =================================
            // FLIGHT BOOKING
            // =================================

            if (
                currentMemory.transport ===
                "Flight"
            ) {

                setTimeout(
                    () => {

                        window.location.href =
                            "flight_ticket_booking.html";

                    },
                    1500
                );


                return {

                    intent,
                    entities,

                    memory:
                        currentMemory,

                    reply:
`✈️ Opening Flight Booking...`

                };

            }

        }


        // =====================================
        // STEP 10 : DEFAULT
        // =====================================

        return {

            intent,
            entities,

            memory:
                memoryStore.getAll(),

            reply:
`😊 I'm still learning how to help with that.`

        };

    }

}


// =====================================
// CREATE AI
// =====================================

const djgstAI =
    new DJGSTAI();


export default djgstAI;

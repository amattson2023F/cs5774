/* Shared PocketBase client for the SpriteDex frontend. */
(function (window) {
    "use strict";

    const pocketBaseUrl = window.SPRITEDEX_POCKETBASE_URL || "http://127.0.0.1:8090";

    if (!window.PocketBase) {
        throw new Error("The PocketBase SDK was not loaded.");
    }

    window.spriteDexPocketBase = new window.PocketBase(pocketBaseUrl);
})(window);

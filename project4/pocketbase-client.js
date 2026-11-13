/* Shared PocketBase client for the SpriteDex frontend. */
(function (window) {
    "use strict";

    const pocketBaseUrl = window.SPRITEDEX_POCKETBASE_URL || "http://127.0.0.1:8090";

    window.spriteDexPocketBase = window.PocketBase
        ? new window.PocketBase(pocketBaseUrl)
        : null;
})(window);

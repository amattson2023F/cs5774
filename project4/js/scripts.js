/* Shared PocketBase behavior for SpriteDex. */

// Phase 4: keep authentication in PocketBase's auth store and synchronize UI.
$(function () {
    const pb = window.spriteDexPocketBase;
    const $loginForm = $("#login-form");
    const $loginPanel = $("#login-panel");
    const $authenticatedContent = $("[data-authenticated-content]");

    function isAuthenticated() {
        return Boolean(pb && pb.authStore.isValid && pb.authStore.record);
    }

    function addAuthGate($element) {
        if ($element.prev(".auth-required-message").length > 0) {
            return;
        }
        $("<p>", { class: "auth-required-message" })
            .append("Please ")
            .append($("<a>", { href: "homealt.html", text: "log in" }))
            .append(" to manage your personal collection.")
            .insertBefore($element);
    }

    function updateAuthUI() {
        const authenticated = isAuthenticated();
        if (authenticated && $("body").hasClass("public-home")) {
            window.location.href = "homealt.html";
            return;
        }
        const $detailBackLink = $(".detail-back-link");
        if ($detailBackLink.length) {
            $detailBackLink.attr("href", authenticated ? "list.html" : "index.html")
                .text(authenticated ? "← Back to My Collection" : "← Back to Sprites");
        }
        const $accountActions = $(".account-actions");
        $accountActions.empty();

        if (authenticated) {
            $("<button>", { class: "button", type: "button", text: "Log Out" })
                .attr("data-auth-action", "logout")
                .appendTo($accountActions);
        } else {
            $("<a>", { class: "button", href: "homealt.html", text: "Log In" })
                .appendTo($accountActions);
            $("<a>", { class: "button button-dark", href: "homealt.html", text: "Sign Up" })
                .appendTo($accountActions);
        }

        $loginPanel.prop("hidden", authenticated);
        $authenticatedContent.prop("hidden", !authenticated);
        $(".detail-form, .add-form, .collection").each(function () {
            const $element = $(this);
            $element.prop("hidden", !authenticated
                || $element.is("[data-phase5-legacy-form]")
                || $element.is("[data-detail-edit-form]"));
            if (!authenticated) {
                addAuthGate($element);
            } else {
                $element.prev(".auth-required-message").remove();
            }
        });
    }

    if (pb) {
        pb.authStore.onChange(updateAuthUI);
    }
    updateAuthUI();

    $(document).on("click", "[data-auth-action='logout']", function () {
        if (pb) {
            pb.authStore.clear();
            window.location.href = "index.html";
        }
    });

    $loginForm.on("submit", function (event) {
        event.preventDefault();
        const $status = $("#login-status");
        const email = $("#login-email").val().trim();
        const password = $("#login-password").val();
        if (!email || !password) {
            $status.attr("role", "alert").text("Enter your email and password.");
            return;
        }
        if (!pb) {
            $status.attr("role", "alert").text("PocketBase is unavailable. Start the server and try again.");
            return;
        }

        $status.attr("role", "status").text("Logging in…");
        pb.collection("users").authWithPassword(email, password)
            .then(function () {
                $status.text("Login successful.");
                window.location.href = "index.html";
            })
            .catch(function (error) {
                console.error("Unable to log in to PocketBase.", error);
                const message = error && error.status === 400
                    ? "The email or password is incorrect."
                    : "Could not connect to PocketBase. Check that the server is running and try again.";
                $status.attr("role", "alert").text(message);
            });
    });
});

// Phase 5: create a personal user_sprites record from the sprite detail page.
$(function () {
    const $detail = $(".sprite-detail");
    const pb = window.spriteDexPocketBase;
    if ($detail.length === 0 || !pb || !$detail.is("[data-detail-add-enabled]")) {
        return;
    }

    const spriteId = new URLSearchParams(window.location.search).get("sprite");
    const $legacyForm = $detail.find("[data-phase5-legacy-form]");
    const $panel = $("<section>", {
        class: "collection-add-panel",
        "aria-labelledby": "collection-add-title",
        hidden: true
    });
    $("<h2>", { id: "collection-add-title", text: "Your Collection" }).appendTo($panel);
    const $status = $("<p>", { class: "collection-add-status", role: "status", "aria-live": "polite" })
        .appendTo($panel);
    const $button = $("<button>", {
        class: "button button-dark",
        type: "button",
        text: "Add to My Collection"
    }).appendTo($panel);
    $panel.insertBefore($legacyForm);

    function isAuthenticated() {
        return pb.authStore.isValid && pb.authStore.record;
    }

    function setStatus(message, isError) {
        $status.attr("role", isError ? "alert" : "status").text(message);
    }

    function findExistingRecord() {
        const userId = pb.authStore.record.id;
        const filter = 'user = "' + userId + '" && sprite = "' + spriteId + '"';
        return pb.collection("user_sprites").getList(1, 1, { filter: filter });
    }

    function refreshAddState() {
        if (!isAuthenticated() || !spriteId) {
            $panel.prop("hidden", true);
            return;
        }

        $panel.prop("hidden", false);
        $button.prop("disabled", true);
        setStatus("Checking your collection…", false);
        findExistingRecord()
            .then(function (result) {
                if (result.items.length > 0) {
                    $button.prop("hidden", true);
                    setStatus("This sprite is already in your collection.", false);
                } else {
                    $button.prop("hidden", false).prop("disabled", false);
                    setStatus("Add this sprite to your personal collection.", false);
                }
            })
            .catch(function (error) {
                console.error("Unable to check the personal sprite collection.", error);
                $button.prop("hidden", true);
                setStatus("Could not check your collection. Make sure the user_sprites collection is available.", true);
            });
    }

    $button.on("click", function () {
        if (!isAuthenticated()) {
            return;
        }
        $button.prop("disabled", true);
        setStatus("Adding sprite…", false);
        pb.collection("user_sprites").create({
            user: pb.authStore.record.id,
            sprite: spriteId,
            is_mastered: false,
            notes: ""
        })
            .then(function () {
                $button.prop("hidden", true);
                setStatus("Added to your collection.", false);
            })
            .catch(function (error) {
                console.error("Unable to add sprite to the personal collection.", error);
                $button.prop("disabled", false);
                setStatus("Could not add this sprite. Please try again.", true);
            });
    });

    pb.authStore.onChange(refreshAddState);
    refreshAddState();
});

// Phase 5: create user_sprites records from the dedicated add page.
$(function () {
    const $form = $("#add-to-collection-form");
    const pb = window.spriteDexPocketBase;
    if ($form.length === 0 || !pb) {
        return;
    }

    const $spriteSelect = $form.find("#sprite");
    const $status = $form.find(".add-form-status");
    const $button = $form.find("#add-to-collection-button");

    function isAuthenticated() {
        return pb.authStore.isValid && pb.authStore.record;
    }

    function setStatus(message, isError) {
        $status.attr("role", isError ? "alert" : "status").text(message);
    }

    function currentSpriteId() {
        return $spriteSelect.val();
    }

    function loadSpriteOptions() {
        pb.collection("sprites").getFullList({ sort: "name" })
            .then(function (sprites) {
                $spriteSelect.empty();
                sprites.forEach(function (sprite) {
                    $("<option>", { value: sprite.id, text: sprite.name || "Unnamed Sprite" })
                        .appendTo($spriteSelect);
                });
                if (sprites.length === 0) {
                    $spriteSelect.append($("<option>", {
                        value: "",
                        text: "No sprites available",
                        disabled: true,
                        selected: true
                    }));
                    setStatus("No sprites are available to add.", true);
                    return;
                }
                updatePreview();
                if (isAuthenticated()) {
                    checkDuplicate();
                }
            })
            .catch(function (error) {
                console.error("Unable to load sprites for the add form.", error);
                setStatus("Could not load sprites. Check that PocketBase is running and try again.", true);
            });
    }

    function updatePreview() {
        const spriteId = currentSpriteId();
        if (!spriteId) {
            return;
        }
        pb.collection("sprites").getOne(spriteId)
            .then(function (sprite) {
                const name = sprite.name || "Unnamed Sprite";
                const imageUrl = sprite.image ? pb.files.getURL(sprite, sprite.image) : "";
                $(".sprite-preview .sprite-portrait").attr({ src: imageUrl, alt: name });
                $(".preview-name").text(name);
                $(".preview-rarity").text(sprite.rarity || "");
                $(".preview-season").text(sprite.season || sprite.category || "");
                $(".preview-description").text(sprite.description || "No description is available for this sprite.");
            })
            .catch(function () {
                setStatus("Could not load the selected sprite preview.", true);
            });
    }

    function checkDuplicate() {
        if (!isAuthenticated()) {
            return;
        }
        $button.prop("disabled", true).prop("hidden", false);
        setStatus("Checking your collection…", false);
        const filter = 'user = "' + pb.authStore.record.id + '" && sprite = "' + currentSpriteId() + '"';
        pb.collection("user_sprites").getList(1, 1, { filter: filter })
            .then(function (result) {
                if (result.items.length > 0) {
                    $button.prop("hidden", true);
                    setStatus("This sprite is already in your collection.", false);
                } else {
                    $button.prop("hidden", false).prop("disabled", false);
                    setStatus("", false);
                }
            })
            .catch(function (error) {
                console.error("Unable to check for an existing collection record.", error);
                $button.prop("disabled", true);
                setStatus("Could not check your collection. Make sure PocketBase is running and try again.", true);
            });
    }

    $spriteSelect.on("change", function () {
        updatePreview();
        checkDuplicate();
    });

    $form.on("submit", function (event) {
        event.preventDefault();
        if (!isAuthenticated()) {
            setStatus("Please log in before adding a sprite.", true);
            return;
        }
        const mastered = $form.find("input[name='status']:checked").val() === "mastered";
        const notes = $form.find("#notes").val().trim();
        $button.prop("disabled", true);
        setStatus("Adding sprite…", false);
        pb.collection("user_sprites").create({
            user: pb.authStore.record.id,
            sprite: currentSpriteId(),
            is_mastered: mastered,
            notes: notes
        })
            .then(function () {
                $button.prop("hidden", true);
                setStatus("Sprite added to your collection.", false);
            })
            .catch(function (error) {
                console.error("Unable to add sprite to the personal collection.", error);
                $button.prop("disabled", false);
                setStatus("Could not add this sprite. It may already be in your collection.", true);
            });
    });

    pb.authStore.onChange(function () {
        if (isAuthenticated()) {
            checkDuplicate();
        }
    });
    loadSpriteOptions();
});

// Phase 7: allow mastery and notes to be edited on the detail page.
$(function () {
    const $form = $("[data-detail-edit-form]");
    const pb = window.spriteDexPocketBase;
    if ($form.length === 0 || !pb) {
        return;
    }

    const spriteId = new URLSearchParams(window.location.search).get("sprite");

    function loadEditor() {
        $form.prop("hidden", true).empty();
        if (!pb.authStore.isValid || !pb.authStore.record || !spriteId) {
            return;
        }

        const filter = 'user = "' + pb.authStore.record.id + '" && sprite = "' + spriteId + '"';
        pb.collection("user_sprites").getList(1, 1, { filter: filter })
            .then(function (result) {
                const record = result.items[0];
                if (!record) {
                    return;
                }

                $form.attr("aria-labelledby", "detail-edit-title");
                $("<h2>", { id: "detail-edit-title", text: "Edit Collection Details" }).appendTo($form);
                const $masteryLabel = $("<label>", { class: "collection-mastery-toggle" });
                $("<input>", {
                    type: "checkbox",
                    id: "detail-mastered",
                    checked: Boolean(record.is_mastered)
                }).appendTo($masteryLabel);
                $masteryLabel.append(" Mastered").appendTo($form);
                const $notesLabel = $("<label>", { class: "collection-notes-field" }).text("Notes");
                $("<textarea>", {
                    id: "detail-notes",
                    rows: 4,
                    placeholder: "Add notes about this Sprite."
                }).val(record.notes || "").appendTo($notesLabel);
                $notesLabel.appendTo($form);
                const $saveStatus = $("<p>", {
                    class: "detail-save-status",
                    role: "status",
                    "aria-live": "polite"
                }).appendTo($form);
                $("<button>", {
                    class: "button button-dark",
                    type: "submit",
                    text: "Save Changes"
                }).appendTo($form);
                const $deleteButton = $("<button>", {
                    class: "button button-delete",
                    type: "button",
                    text: "Remove from My Collection"
                }).appendTo($form);
                $form.prop("hidden", false);

                $form.off("submit.detailEdit").on("submit.detailEdit", function (event) {
                    event.preventDefault();
                    const $saveButton = $form.find("button[type='submit']");
                    $saveButton.prop("disabled", true);
                    $saveStatus.text("Saving…");
                    pb.collection("user_sprites").update(record.id, {
                        is_mastered: $form.find("#detail-mastered").prop("checked"),
                        notes: $form.find("#detail-notes").val().trim()
                    })
                        .then(function (updatedRecord) {
                            record.is_mastered = updatedRecord.is_mastered;
                            record.notes = updatedRecord.notes;
                            $("[data-personal-mastered]").text(record.is_mastered ? "Mastered" : "Not Mastered");
                            $("[data-personal-notes]").text(record.notes || "No notes saved.");
                            $saveStatus.text("Saved.");
                            $saveButton.prop("disabled", false);
                        })
                        .catch(function (error) {
                            console.error("Unable to update the personal sprite record.", error);
                            $saveStatus.attr("role", "alert").text("Could not save changes. Please try again.");
                            $saveButton.prop("disabled", false);
                        });
                });

                $deleteButton.on("click", function () {
                    if (!window.confirm("Remove this sprite from your collection?")) {
                        return;
                    }
                    const $saveButton = $form.find("button[type='submit']");
                    $deleteButton.prop("disabled", true);
                    $saveButton.prop("disabled", true);
                    $saveStatus.attr("role", "status").text("Removing…");
                    pb.collection("user_sprites").delete(record.id)
                        .then(function () {
                            window.location.href = "list.html";
                        })
                        .catch(function (error) {
                            console.error("Unable to remove the personal sprite record.", error);
                            $saveStatus.attr("role", "alert").text("Could not remove this sprite. Please try again.");
                            $deleteButton.prop("disabled", false);
                            $saveButton.prop("disabled", false);
                        });
                });
            })
            .catch(function (error) {
                console.error("Unable to load the detail editor.", error);
            });
    }

    pb.authStore.onChange(loadEditor);
    loadEditor();
});

// Keep the logged-in dashboard synchronized with PocketBase.
$(function () {
    const $dashboard = $("[data-pocketbase-dashboard]");
    const pb = window.spriteDexPocketBase;
    if ($dashboard.length === 0 || !pb) {
        return;
    }

    function loadDashboard() {
        if (!pb.authStore.isValid || !pb.authStore.record) {
            return;
        }

        Promise.all([
            pb.collection("sprites").getList(1, 1),
            pb.collection("user_sprites").getFullList({
                sort: "-created",
                filter: 'user = "' + pb.authStore.record.id + '"',
                expand: "sprite"
            })
        ])
            .then(function (results) {
                const total = results[0].totalItems;
                const records = results[1];
                const owned = records.length;
                const mastered = records.filter(function (record) {
                    return Boolean(record.is_mastered);
                }).length;
                const notMastered = owned - mastered;
                const notOwned = Math.max(total - owned, 0);
                const percentage = total ? Math.round((owned / total) * 100) : 0;

                $dashboard.find(".collection-total .stat-value").text(percentage + "%");
                $dashboard.find(".collection-total span").text(owned + " owned out of " + total + " total Sprites");
                $dashboard.find(".collection-total progress")
                    .attr({ max: total, value: owned, "aria-label": "Collection owned: " + owned + " of " + total + " Sprites" })
                    .text(owned + " of " + total);
                $dashboard.find(".metric-panel .stat-value").eq(0).text(total);
                $dashboard.find(".metric-panel .stat-value").eq(1).text(owned);
                $dashboard.find(".dashboard-mastered-count").text(mastered);
                $dashboard.find(".dashboard-mastered-label").text("Mastered (" + mastered + ")");
                $dashboard.find(".status-owned").css("flex-grow", notMastered);
                $dashboard.find(".status-mastered").css("flex-grow", mastered);
                $dashboard.find(".status-bar").attr("aria-label", total + " Sprites: "
                    + notMastered + " owned but not mastered, " + mastered + " mastered, and " + notOwned + " not owned.");
                $dashboard.find(".status-legend li").eq(0).text("Owned (" + owned + ")");
                $dashboard.find(".status-legend li").eq(1).text("Not owned (" + notOwned + ")");
                $dashboard.find(".status-legend li").eq(2).find(".dashboard-mastered-label").text("Mastered (" + mastered + ")");

                const $activity = $dashboard.find(".activity-list").empty();
                if (records.length === 0) {
                    $("<li>").text("No sprites have been added to your collection yet.").appendTo($activity);
                } else {
                    records.slice(0, 5).forEach(function (record) {
                        const sprite = record.expand && record.expand.sprite;
                        if (!sprite) {
                            return;
                        }
                        const name = sprite.name || "Unnamed Sprite";
                        const imageUrl = sprite.image ? pb.files.getURL(sprite, sprite.image) : "";
                        const $item = $("<li>");
                        if (imageUrl) {
                            $("<img>", { src: imageUrl, alt: name, width: 60, height: 53 }).appendTo($item);
                        }
                        const $copy = $("<div>").appendTo($item);
                        $("<p>").append("You added the ")
                            .append($("<a>", { href: "detail.html?sprite=" + encodeURIComponent(sprite.id), text: name }))
                            .append(" to your collection.")
                            .appendTo($copy);
                        $("<p>", {
                            class: "activity-date",
                            text: new Date(record.created).toLocaleDateString()
                        }).appendTo($copy);
                        $item.appendTo($activity);
                    });
                }

                const $chart = $dashboard.find(".chart-columns").empty();
                const $chartItem = $("<li>");
                $("<span>", {
                    class: "visually-hidden",
                    text: "Chapter 7 Mini Season: " + owned + " owned, " + notOwned + " not owned."
                }).appendTo($chartItem);
                $("<span>", { class: "season-label", text: "C7 Mini" }).appendTo($chartItem);
                $chartItem.appendTo($chart);
            })
            .catch(function (error) {
                console.error("Unable to load the dashboard data.", error);
            });
    }

    pb.authStore.onChange(loadDashboard);
    loadDashboard();
});

// Phase 6: read the authenticated user's personal sprite collection.
$(function () {
    const $collection = $("[data-pocketbase-collection-page]");
    const pb = window.spriteDexPocketBase;
    if ($collection.length === 0 || !pb) {
        return;
    }

    const $grid = $collection.find("[data-pocketbase-collection]");
    const $filters = $collection.find(".collection-filters");
    const $status = $("<p>", {
        class: "collection-status-message",
        role: "status",
        "aria-live": "polite"
    }).insertBefore($grid);
    let collectionRecords = [];
    let totalSpriteCount = 0;

    function isAuthenticated() {
        return pb.authStore.isValid && pb.authStore.record;
    }

    function normalize(value) {
        return String(value || "").trim().toLowerCase();
    }

    function getSprite(record) {
        return record.expand && record.expand.sprite ? record.expand.sprite : null;
    }

    function render(records) {
        const query = normalize($filters.find("#collection-search").val());
        const season = normalize($filters.find("#season").val());
        const status = normalize($filters.find("#status").val());
        const sort = $filters.find("#sort").val();
        const visible = records.filter(function (entry) {
            const sprite = entry.sprite;
            const name = normalize(sprite.name);
            const spriteSeason = normalize(sprite.season || sprite.category);
            const mastered = Boolean(entry.collection.is_mastered);
            const seasonMatches = season === "all"
                || (season === "c7mini" && spriteSeason === "chapter 7 mini season");
            const statusMatches = status === "all"
                || (status === "mastered" && mastered)
                || (status === "not-mastered" && !mastered);
            return (!query || name.includes(query)) && seasonMatches && statusMatches;
        }).sort(function (left, right) {
            if (sort === "mastered") {
                return Number(right.collection.is_mastered) - Number(left.collection.is_mastered);
            }
            if (sort === "season") {
                return normalize(left.sprite.season || left.sprite.category)
                    .localeCompare(normalize(right.sprite.season || right.sprite.category));
            }
            return normalize(left.sprite.name).localeCompare(normalize(right.sprite.name));
        });

        $grid.empty();
        visible.forEach(function (entry) {
            const sprite = entry.sprite;
            const name = sprite.name || "Unnamed Sprite";
            const seasonText = sprite.season || sprite.category || "";
            const rarity = sprite.rarity || "";
            const mastered = Boolean(entry.collection.is_mastered);
            const imageUrl = sprite.image ? pb.files.getURL(sprite, sprite.image) : "";
            const $card = $("<article>", {
                class: "sprite-card",
                "data-sprite": sprite.id
            });
            const $link = $("<a>", { href: "detail.html?sprite=" + encodeURIComponent(sprite.id) });
            const $art = $("<div>", { class: "card-art" });
            const $image = $("<img>", { alt: name });
            if (imageUrl) {
                $image.attr("src", imageUrl);
            }
            const $copy = $("<div>", { class: "card-copy" });
            $("<h2>").text(name).appendTo($copy);
            $("<p>").text(seasonText).appendTo($copy);
            const $tags = $("<ul>", {
                class: "tags",
                "aria-label": "Sprite rarity and collection status"
            });
            $("<li>").text(rarity).appendTo($tags);
            $("<li>").text("Owned").appendTo($tags);
            $("<li>").addClass("collection-status-tag").text(mastered ? "Mastered" : "Not Mastered").appendTo($tags);
            $image.appendTo($art);
            $art.appendTo($link);
            $copy.appendTo($link);
            $tags.appendTo($copy);
            $link.appendTo($card);
            const $edit = $("<div>", {
                class: "collection-mastery-control",
                "data-user-sprite-id": entry.collection.id
            });
            const $masteryLabel = $("<label>", { class: "collection-mastery-toggle" });
            $("<input>", {
                type: "checkbox",
                class: "collection-mastery-checkbox",
                checked: mastered
            }).appendTo($masteryLabel);
            $masteryLabel.append(" Mastered").appendTo($edit);
            $edit.appendTo($card);
            $card.appendTo($grid);
        });

        const masteredCount = records.filter(function (entry) {
            return Boolean(entry.collection.is_mastered);
        }).length;
        $collection.find(".collection-summary .collection-stat").eq(0).find("strong")
            .text(records.length + " / " + totalSpriteCount);
        $collection.find(".collection-summary .collection-stat").eq(1).find("strong")
            .text(masteredCount + " / " + records.length);
        $status.text(records.length === 0
            ? "Your collection is empty. Add a sprite from the Browse page."
            : (visible.length === 0 ? "No sprites match your collection filters." : ""));
    }

    function loadCollection() {
        $grid.empty();
        if (!isAuthenticated()) {
            return;
        }
        $status.text("Loading your collection…");
        Promise.all([
            pb.collection("sprites").getList(1, 1),
            pb.collection("user_sprites").getFullList({
                sort: "created",
                filter: 'user = "' + pb.authStore.record.id + '"',
                expand: "sprite"
            })
        ])
            .then(function (results) {
                totalSpriteCount = results[0].totalItems;
                const records = results[1];
                return Promise.all(records.map(function (record) {
                    const sprite = getSprite(record);
                    return sprite
                        ? { collection: record, sprite: sprite }
                        : pb.collection("sprites").getOne(record.sprite).then(function (loadedSprite) {
                            return { collection: record, sprite: loadedSprite };
                        });
                }));
            })
            .then(function (records) {
                collectionRecords = records;
                if (records.length === 0) {
                    render(records);
                    return;
                }
                $status.text("");
                render(records);
            })
            .catch(function (error) {
                console.error("Unable to load the personal sprite collection.", error);
                $status.attr("role", "alert").text("Could not load your collection. Check that PocketBase is running and try again.");
            });
    }

    $filters.on("submit", function (event) {
        event.preventDefault();
        render(collectionRecords);
    }).on("input change", "input, select", function () {
        render(collectionRecords);
    });
    $grid.on("change", ".collection-mastery-checkbox", function () {
        const $button = $(this);
        const $edit = $button.closest(".collection-mastery-control");
        const collectionId = $edit.attr("data-user-sprite-id");
        const entry = collectionRecords.find(function (item) {
            return item.collection.id === collectionId;
        });
        if (!entry) {
            return;
        }

        const mastered = $button.prop("checked");
        $button.prop("disabled", true);
        pb.collection("user_sprites").update(collectionId, {
            is_mastered: mastered
        })
            .then(function (updatedRecord) {
                entry.collection = updatedRecord;
                const $card = $edit.closest(".sprite-card");
                $card.find(".collection-status-tag").text(mastered ? "Mastered" : "Not Mastered");
                $button.prop("disabled", false);
                const masteredCount = collectionRecords.filter(function (item) {
                    return Boolean(item.collection.is_mastered);
                }).length;
                $collection.find(".collection-summary .collection-stat").eq(1).find("strong")
                    .text(masteredCount + " / " + collectionRecords.length);
            })
            .catch(function (error) {
                console.error("Unable to update the personal sprite record.", error);
                $button.prop("disabled", false);
                $button.prop("checked", !mastered);
            });
    });
    pb.authStore.onChange(loadCollection);
    loadCollection();
});

// Phase 1: load the public sprites collection into the existing browse grid.
$(function () {
    const $grid = $(".explore .sprite-grid");
    if ($grid.length === 0) {
        return;
    }

    const $explore = $grid.closest(".explore");
    const $status = $("<p>", { class: "browse-status", role: "status", "aria-live": "polite" })
        .insertBefore($grid);
    $grid.empty();
    $status.text("Loading sprites…");

    function getImageUrl(record) {
        if (!record.image) {
            return "";
        }
        return window.spriteDexPocketBase.files.getURL(record, record.image);
    }

    function escapeText(value) {
        return value == null ? "" : String(value);
    }

    function renderSprites(records) {
        const heroRecord = records.find(function (record) {
            return String(record.name || "").toLowerCase() === "halfpeel'd";
        });
        const $hero = $("[data-pocketbase-hero]");
        if (heroRecord && heroRecord.image && $hero.length) {
            $hero.attr({
                src: getImageUrl(heroRecord),
                alt: heroRecord.name
            });
        }
        records.forEach(function (record) {
            const name = escapeText(record.name || "Unnamed Sprite");
            const description = escapeText(record.season || record.category || "");
            const rarity = escapeText(record.rarity || "");
            const imageUrl = getImageUrl(record);
            const $card = $("<article>", { class: "sprite-card" });
            const $link = $("<a>", { href: "detail.html?sprite=" + encodeURIComponent(record.id) });
            const $art = $("<div>", { class: "card-art" });
            const $image = $("<img>", { alt: name });
            if (imageUrl) {
                $image.attr("src", imageUrl);
            }
            const $copy = $("<div>", { class: "card-copy" });
            $("<h3>").text(name).appendTo($copy);
            $("<p>").text(description).appendTo($copy);
            const $tags = $("<ul>", { class: "tags", "aria-label": "Sprite attributes" });
            if (rarity) {
                $("<li>").text(rarity).appendTo($tags);
            }
            $image.appendTo($art);
            $art.appendTo($link);
            $copy.appendTo($link);
            $tags.appendTo($copy);
            $link.appendTo($card);
            $card.appendTo($grid);
        });
    }

    if (!window.spriteDexPocketBase) {
        $status.attr("role", "alert").text("Could not connect to PocketBase. The PocketBase SDK is unavailable.");
        return;
    }

    window.spriteDexPocketBase.collection("sprites").getFullList({ sort: "name" })
        .then(function (records) {
            if (records.length === 0) {
                $status.text("No sprites are available yet.");
                return;
            }
            $status.remove();
            renderSprites(records);
        })
        .catch(function (error) {
            console.error("Unable to load sprites from PocketBase.", error);
            $status.attr("role", "alert")
                .text("Could not load sprites. Check that PocketBase is running and try again.");
        });
});

// Phase 2: load one sprite from PocketBase using the ID in detail.html?sprite=…
$(function () {
    const $layout = $(".sprite-detail .detail-layout");
    if ($layout.length === 0) {
        return;
    }

    const $status = $(".detail-status");
    const spriteId = new URLSearchParams(window.location.search).get("sprite");

    function showError(message) {
        $layout.prop("hidden", true);
        $status.attr("role", "alert").text(message);
    }

    if (!spriteId) {
        showError("No sprite ID was provided. Return to the Sprites page and choose a sprite.");
        return;
    }

    if (!window.spriteDexPocketBase) {
        showError("Could not connect to PocketBase. The PocketBase SDK is unavailable.");
        return;
    }

    window.spriteDexPocketBase.collection("sprites").getOne(spriteId)
        .then(function (record) {
            const name = record.name || "Unnamed Sprite";
            const rarity = record.rarity || "";
            const season = record.season || record.category || "";
            const description = record.description || "No description is available for this sprite.";
            const imageUrl = record.image
                ? window.spriteDexPocketBase.files.getURL(record, record.image)
                : "";

            $("[data-sprite-name]").text(name);
            $("[data-sprite-name-detail]").text(name);
            $("[data-sprite-rarity], [data-sprite-rarity-detail]").text(rarity);
            $("[data-sprite-season], [data-sprite-season-detail]").text(season);
            $("[data-sprite-description]").text(description);
            $("[data-sprite-image]").attr({ src: imageUrl, alt: name });

            document.title = name + " — SpriteDex";
            $status.remove();
            $layout.prop("hidden", false);
        })
        .catch(function (error) {
            console.error("Unable to load sprite from PocketBase.", error);
            if (error && error.status === 404) {
                showError("Sprite not found. Check the URL or return to the Sprites page.");
                return;
            }
            showError("Could not load this sprite. Check that PocketBase is running and try again.");
        });
});

$(function () {
    const $searchResults = $("#search-results");
    const pb = window.spriteDexPocketBase;
    if ($searchResults.length === 0 || !pb) {
        return;
    }

    const query = (new URLSearchParams(window.location.search).get("q") || "").trim();
    $("#site-search-q").val(query);
    if (!query) {
        $("#search-summary").text("Enter a search phrase to find a Sprite.");
        $("#search-empty").prop("hidden", false);
        return;
    }

    $("#search-summary").text("Searching SpriteDex…");
    pb.collection("sprites").getFullList({ sort: "name" })
        .then(function (sprites) {
            const needle = query.toLowerCase();
            const matches = sprites.filter(function (sprite) {
                return [sprite.name, sprite.description, sprite.rarity, sprite.season, sprite.category]
                    .some(function (value) {
                        return String(value || "").toLowerCase().includes(needle);
                    });
            });
            $searchResults.empty();
            matches.forEach(function (sprite) {
                const imageUrl = sprite.image ? pb.files.getURL(sprite, sprite.image) : "";
                const $card = $("<article>", { class: "sprite-card" });
                const $link = $("<a>", { href: "detail.html?sprite=" + encodeURIComponent(sprite.id) });
                const $art = $("<div>", { class: "card-art" });
                if (imageUrl) {
                    $("<img>", { src: imageUrl, alt: sprite.name || "Sprite" }).appendTo($art);
                }
                $("<div>", { class: "card-copy" })
                    .append($("<h2>").text(sprite.name || "Unnamed Sprite"))
                    .append($("<p>").text(sprite.season || sprite.category || ""))
                    .append($("<p>").text(sprite.description || ""))
                    .append($("<ul>", { class: "tags", "aria-label": "Sprite attributes" })
                        .append($("<li>").text(sprite.rarity || "")))
                    .appendTo($link);
                $art.appendTo($link);
                $link.appendTo($card);
                $card.appendTo($searchResults);
            });
            $("#search-summary").text(matches.length + " result" + (matches.length === 1 ? "" : "s") + " found.");
            $searchResults.prop("hidden", matches.length === 0);
            $("#search-empty").prop("hidden", matches.length > 0);
        })
        .catch(function (error) {
            console.error("Unable to search sprites from PocketBase.", error);
            $("#search-summary").attr("role", "alert").text("Could not search sprites. Check that PocketBase is running and try again.");
            $searchResults.prop("hidden", true);
            $("#search-empty").prop("hidden", false);
        });
});

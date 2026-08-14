// Behavior smoke test for the built editor bundle, run in jsdom.
//
// Replaces the qunit/PhantomJS rig: PhantomJS predates fetch, so it cannot
// run the editor at all anymore. This exercises the same ground on the real
// bundle: boot, menu toggle, opening a scribble, the preview and save POST
// round-trips, the template-error path, and the localStorage draft cycle.
//
// Usage: make test-js   (builds the bundle, then runs this with node)
// Requires the jsdom devDependency (npm install).

const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { JSDOM } = require("jsdom");

const BUNDLE = resolve(__dirname, "../../static/scribbler/js/scribbler.js");

const html = `<!doctype html><html><body>
<div class="scribble-wrapper scribble-home with-controls">
    <div class="scribble-content original">Hello <b>world</b></div>
    <form class="scribble-form" data-prefix="home" data-save="/scribbler/save/1/"
          action="/scribbler/preview/" method="post">
        <div class="hidden">
            <input type="hidden" name="csrfmiddlewaretoken" value="CSRF123">
            <input type="hidden" name="home-slug" value="home">
            <input type="text">
        </div>
        <textarea name="home-content">Hello {{ user }}</textarea>
    </form>
    <pre class="scribble-default">Hello</pre>
    <div class="scribble-content preview"></div>
</div>
</body></html>`;

const dom = new JSDOM(html, {
    url: "https://example.com/somepage/",
    pretendToBeVisual: true,
    runScripts: "outside-only",
});
const { window } = dom;

// CodeMirror 5 measures text via ranges; jsdom has no layout, so give it
// the standard zero-rect stub every CodeMirror-in-jsdom setup uses.
const origCreateRange = window.document.createRange.bind(window.document);
window.document.createRange = () => {
    const range = origCreateRange();
    range.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
    range.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });
    return range;
};

const failures = [];
const check = (label, ok) => { if (!ok) failures.push(label); };

// ---- fetch stub -------------------------------------------------------
const calls = [];
let nextResponse = { valid: true, html: "<p>previewed</p>", variables: ["user"] };
window.fetch = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(nextResponse),
    });
};
const settle = () => new Promise((r) => setTimeout(r, 30));

(async () => {
    // ---- boot ---------------------------------------------------------
    window.eval(readFileSync(BUNDLE, "utf8"));
    await settle();

    const editorEl = window.document.getElementById("scribbleEditorContainer");
    const menuEl = window.document.getElementById("scribbleMenuContainer");
    check("editor container appended", !!editorEl);
    check("menu container appended", !!menuEl);
    check("CodeMirror instantiated", !!(editorEl && editorEl.querySelector(".CodeMirror")));
    check("controls built", !!(editorEl && editorEl.querySelector(".controls .save")));
    // jsdom has no layout: the menu's offsetHeight is 0, so closed top is -(5+0)
    check("menu starts closed", menuEl && menuEl.style.top === "-5px");

    // ---- menu toggle ---------------------------------------------------
    const tab = menuEl.querySelector("a.tab");
    tab.dispatchEvent(new window.Event("click", { bubbles: true }));
    check("menu opens on tab click", menuEl.style.top === "0px");
    menuEl.querySelector("a.reveal").dispatchEvent(new window.Event("click", { bubbles: true }));
    check("reveal highlights scribbles",
        window.document.querySelector(".scribble-wrapper").classList.contains("highlight"));
    tab.dispatchEvent(new window.Event("click", { bubbles: true }));
    check("menu closes again", menuEl.style.top === "-5px");
    check("closing clears highlight",
        !window.document.querySelector(".scribble-wrapper").classList.contains("highlight"));

    // ---- open a scribble -----------------------------------------------
    const wrapper = window.document.querySelector(".scribble-wrapper");
    wrapper.querySelector(".scribble-content.original")
        .dispatchEvent(new window.Event("click", { bubbles: true }));
    await settle();
    check("editor slides open", editorEl.style.height === "300px");

    const cm = editorEl.querySelector(".CodeMirror").CodeMirror;
    check("editor loaded form content", cm.getValue() === "Hello {{ user }}");

    // open() already fired one preview (setValue triggers change, as always)
    const callsBeforeEdit = calls.length;
    cm.setValue("Hello {{ user }} edited");
    await settle();
    check("edit fired a preview POST", calls.length > callsBeforeEdit);
    if (calls.length) {
        const { url, init } = calls[calls.length - 1];
        check("preview POSTs to form action", url === "/scribbler/preview/");
        check("preview method POST", init.method === "POST");
        check("form-encoded content type",
            init.headers["Content-Type"] === "application/x-www-form-urlencoded");
        const body = new window.URLSearchParams(init.body);
        check("prefix stripped from field names", body.get("content") === "Hello {{ user }} edited");
        check("csrf token included", body.get("csrfmiddlewaretoken") === "CSRF123");
        check("slug included", body.get("slug") === "home");
        check("nameless input skipped", ![...body.keys()].includes(""));
    }
    await settle();
    const preview = wrapper.querySelector(".scribble-content.preview");
    check("preview painted", preview.innerHTML === "<p>previewed</p>");
    check("preview shown", preview.style.display === "");
    check("original hidden", wrapper.querySelector(".scribble-content.original").style.display === "none");
    check("save button armed",
        !editorEl.querySelector(".controls .save").classList.contains("inactive"));

    // ---- save ----------------------------------------------------------
    nextResponse = { valid: true, url: "/scribbler/save/2/" };
    const callsBeforeSave = calls.length;
    editorEl.querySelector(".controls .save").dispatchEvent(new window.Event("click", { bubbles: true }));
    await settle();
    // deleteDraft's setValue fires another preview after the save (as always)
    check("save POSTs to data-save URL",
        calls.slice(callsBeforeSave).some((c) => c.url === "/scribbler/save/1/"));
    check("save URL updated from response",
        wrapper.querySelector(".scribble-form").dataset.save === "/scribbler/save/2/");
    check("content swapped to preview HTML",
        wrapper.querySelector(".scribble-content.original").innerHTML === "<p>previewed</p>");
    check("textarea synced",
        wrapper.querySelector("[name$=content]").value === "Hello {{ user }} edited");
    check("editor slides closed after save", editorEl.style.height === "0px");
    check("original visible again",
        wrapper.querySelector(".scribble-content.original").style.display === "");

    // ---- error path ----------------------------------------------------
    wrapper.querySelector(".scribble-content.original")
        .dispatchEvent(new window.Event("click", { bubbles: true }));
    nextResponse = { valid: false, error: { message: "Bad tag", line: 1 } };
    cm.setValue("{% broken %}");
    await settle();
    check("error message shown",
        editorEl.querySelector(".error-msg").innerHTML.includes("Bad tag"));
    check("save disarmed on error",
        editorEl.querySelector(".controls .save").classList.contains("inactive"));

    // ---- draft round-trip ----------------------------------------------
    nextResponse = { valid: true, html: "<p>x</p>", variables: [] };
    editorEl.querySelector(".controls .draft").dispatchEvent(new window.Event("click", { bubbles: true }));
    check("draft stored in localStorage",
        window.localStorage.getItem("/somepage/home") === "{% broken %}");
    editorEl.querySelector(".controls .closed").dispatchEvent(new window.Event("click", { bubbles: true }));
    check("editor closes", editorEl.style.height === "0px");
    wrapper.querySelector(".scribble-content.original")
        .dispatchEvent(new window.Event("click", { bubbles: true }));
    await settle();
    check("draft restored on reopen", cm.getValue() === "{% broken %}");
    editorEl.querySelector(".controls .discard").dispatchEvent(new window.Event("click", { bubbles: true }));
    check("discard restores original textarea value", cm.getValue() === "Hello {{ user }} edited");
    check("discard clears the stored draft",
        window.localStorage.getItem("/somepage/home") === null);

    if (failures.length) {
        console.error("Editor smoke failures:\n  " + failures.join("\n  "));
        process.exit(1);
    }
    console.log("editor smoke: all checks passed (" + calls.length + " fetches)");
    process.exit(0);
})().catch((err) => {
    console.error("CRASHED:", (err && err.stack) || err);
    process.exit(1);
});

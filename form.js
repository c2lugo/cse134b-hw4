/* ---------- Grab the elements we need ---------- */

const form = document.querySelector(".contact-form");
const nameInput = document.querySelector("#name");
const emailInput = document.querySelector("#email");
const commentsInput = document.querySelector("#comments");
const fields = [nameInput, emailInput, commentsInput];

const fieldLabels = {
    name: "Name",
    email: "Email",
    comments: "Comments"
};

const messagesArea = document.querySelector("#form-messages");
const errorList = document.querySelector("#error-list");
const noErrors = document.querySelector("#no-errors");
const infoBox = document.querySelector("#info-box");
const charCount = document.querySelector("#char-count");
const charStatus = document.querySelector("#char-status");

/* ---------- Setup ---------- */

// The message areas start with the `hidden` attribute, so users without
// JavaScript never see empty boxes. Now that JS is running, show them.
messagesArea.hidden = false;

// Hidden field for the error history. Created here (not in the HTML)
// so it's only submitted when JavaScript is actually running.
const errorsField = document.createElement("input");
errorsField.type = "hidden";
errorsField.name = "form-errors";
form.append(errorsField);

// Screen readers will read the character count when the textarea is focused.
addDescribedBy(commentsInput, "char-count");

/* validation messages */

// Which native constraint is failing? (null = valid)
function getErrorType(field) {
    const validity = field.validity;

    if (validity.valueMissing) return "valueMissing";
    if (validity.typeMismatch) return "typeMismatch";
    if (validity.tooShort) return "tooShort";
    if (validity.tooLong) return "tooLong";
    return null;
}

// A specific, helpful message for each kind of problem.
// (The error list adds the field name in front, ex: "Email: ...")
function getErrorMessage(field, errorType) {
    switch (errorType) {
        case "valueMissing":
            return "This field is required. Please fill it in.";
        case "typeMismatch":
            return "Enter a complete email address, like you@example.com.";
        case "tooShort":
            return `Needs at least ${field.minLength} characters. Add a little more.`;
        case "tooLong":
            return `Can be at most ${field.maxLength} characters.`;
        default:
            return "";
    }
}

// Re-check one field and update its custom validity message.
// Returns { type, message }; an empty message means the field is valid.
function checkField(field) {
    field.setCustomValidity("");               // clear the old message first
    const type = getErrorType(field);
    const message = getErrorMessage(field, type);
    field.setCustomValidity(message);          // "" marks the field valid again
    return { type, message };
}

/* ---------- Showing and clearing errors on the page ---------- */

function addDescribedBy(field, id) {
    const ids = (field.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
    if (!ids.includes(id)) {
        ids.push(id);
    }
    field.setAttribute("aria-describedby", ids.join(" "));
}

function removeDescribedBy(field, id) {
    const ids = (field.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);
    field.setAttribute("aria-describedby", ids.filter((existing) => existing !== id).join(" "));
}

function updateNoErrorsMessage() {
    const hasErrors = errorList.children.length > 0;
    errorList.hidden = !hasErrors;
    noErrors.hidden = hasErrors;
}

function showError(field, message) {
    const errorId = `${field.id}-error`;
    let item = document.getElementById(errorId);

    if (!item) {
        item = document.createElement("li");
        item.id = errorId;

        // keep the list in the same order as the fields
        const laterItems = fields
            .slice(fields.indexOf(field) + 1)
            .map((laterField) => document.getElementById(`${laterField.id}-error`));
        const nextItem = laterItems.find((laterItem) => laterItem !== null) ?? null;
        errorList.insertBefore(item, nextItem);
    }

    const text = `${fieldLabels[field.id]}: ${message}`;
    if (item.textContent !== text) {
        item.textContent = text;               // only change when needed (less screen reader noise)
    }

    field.setAttribute("aria-invalid", "true");
    addDescribedBy(field, errorId);
    updateNoErrorsMessage();
}

function clearError(field) {
    const errorId = `${field.id}-error`;
    const item = document.getElementById(errorId);

    if (item) {
        item.remove();
    }

    field.removeAttribute("aria-invalid");
    removeDescribedBy(field, errorId);
    updateNoErrorsMessage();
}

function hasVisibleError(field) {
    return document.getElementById(`${field.id}-error`) !== null;
}

/* ---------- When to check fields ---------- */

fields.forEach((field) => {
    // While typing: keep the custom validity in sync so a fixed field can
    // submit, and update an error that's already showing. New errors are
    // not shown mid-typing.
    field.addEventListener("input", () => {
        field.dataset.edited = "true";
        const { message } = checkField(field);

        if (hasVisibleError(field)) {
            if (message) {
                showError(field, message);
            } else {
                clearError(field);
            }
        }
    });

    // Leaving a field the user has edited: show or clear its error.
    field.addEventListener("blur", () => {
        if (field.dataset.edited !== "true") {
            return;
        }

        const { message } = checkField(field);
        if (message) {
            showError(field, message);
        } else {
            clearError(field);
        }
    });
});

/* Character counter */

const characterLimit = commentsInput.maxLength;   // read from the HTML (1000)
const warningThreshold = 100;                      // warn at 100 or fewer remaining
let counterState = "normal";

function updateCharacterCount() {
    const remaining = characterLimit - commentsInput.value.length;

    charCount.textContent = `${remaining} of ${characterLimit} characters remaining.`;

    let newState = "normal";
    if (remaining <= 0) {
        newState = "limit";
    } else if (remaining <= warningThreshold) {
        newState = "warning";
    }

    infoBox.dataset.state = newState;              // CSS uses this for styling

    // Only update the live message when the state changes, so screen
    // readers aren't interrupted on every keystroke.
    if (newState !== counterState) {
        if (newState === "limit") {
            charStatus.textContent = "Limit reached: you've used all 1,000 characters. You can still send your message.";
        } else if (newState === "warning") {
            charStatus.textContent = `Warning: ${warningThreshold} or fewer characters left.`;
        } else {
            charStatus.textContent = "";
        }
        counterState = newState;
    }
}

// "input" fires for typing, pasting, cutting, and deleting.
commentsInput.addEventListener("input", updateCharacterCount);

/* Error history */

const form_errors = [];
let attemptNumber = 0;
let attemptInProgress = false;
let fieldsRecordedThisAttempt = new Set();

// The browser fires "invalid" on each invalid control when a submission
// is blocked (button click OR pressing Enter), before "submit" would fire.
// We never call checkValidity()/reportValidity() ourselves, so every
// "invalid" event here comes from a submission attempt.
// "invalid" doesn't bubble, so the form listens in the capture phase (true).
form.addEventListener("invalid", (event) => {
    const field = event.target;
    if (!fields.includes(field)) {
        return;
    }

    // All "invalid" events from one attempt fire back-to-back. Start a new
    // attempt on the first one, and end it once that batch is finished.
    if (!attemptInProgress) {
        attemptInProgress = true;
        attemptNumber += 1;
        fieldsRecordedThisAttempt = new Set();
        setTimeout(() => {
            attemptInProgress = false;
        }, 0);
    }

    const { type, message } = checkField(field);
    showError(field, message);

    // Record each field once per attempt. No user-entered values are stored.
    if (!fieldsRecordedThisAttempt.has(field.name)) {
        fieldsRecordedThisAttempt.add(field.name);
        form_errors.push({
            attempt: attemptNumber,
            field: field.name,
            error: type,
            message: message,
            time: new Date().toISOString()
        });
    }
}, true);

// "submit" only fires when the form is valid. Right before it's sent,
// put the serialized history into the hidden field.
form.addEventListener("submit", () => {
    errorsField.value = JSON.stringify(form_errors);
});

/* ---------- Initial state ---------- */

// Set custom messages up front so the browser's popup uses our wording,
// and show the correct count if the browser restored a saved value.
fields.forEach(checkField);
updateCharacterCount();
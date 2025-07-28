import os
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk
import json
from google.generativeai import GenerativeModel, configure
from spellchecker import SpellChecker
import difflib

# ---
# ===== Gemini Configuration =====
# !!! IMPORTANT: Replace "YOUR_GEMINI_API_KEY" with your actual API key !!!
# You can get one from https://aistudio.google.com/app/apikey
API_KEY = "AIzaSyBeMMoCpcf68oOI-1fqhSsVLgCUY_hvuos"
configure(api_key=API_KEY)
# Using 1.5 Flash as it's generally available and free-tier friendly.
# For 2.5 Flash (preview), you could use "gemini-2.5-flash-preview-05-20"
model = GenerativeModel("gemini-1.5-flash-latest")

# ---
# ===== Configuration Files =====
PROMPT_HISTORY_FILE = "prompt_history.json"
CHAT_HISTORY_FILE = "chat_history.json"
CONFIG_FILE = "config.json"  # New config file for project root


# ---
# ===== Helper Functions =====
def load_config():
    """Loads application configuration from config.json."""
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                messagebox.showwarning("Config Error", "Configuration file is corrupted. Resetting to default.")
                return {"project_root": os.getcwd()}
    return {"project_root": os.getcwd()}  # Default to current working directory


def save_config(config):
    """Saves application configuration to config.json."""
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=4)
    except IOError as e:
        messagebox.showerror("Save Error", f"Could not save configuration: {e}")


def get_project_files(project_root='.'):
    """Recursively gets Python and Robot Framework files from a project root."""
    if not os.path.isdir(project_root):
        messagebox.showwarning("Invalid Path", f"Project root '{project_root}' is not a valid directory.")
        return []
    file_list = []
    for root, _, files in os.walk(project_root):
        for file in files:
            if file.endswith(('.py', '.robot')):
                file_list.append(os.path.join(root, file))
    return file_list


def save_history(file_path, item):
    """Generic function to save an item to a JSON history file."""
    history = load_history(file_path)
    if item and item not in history:
        history.append(item)
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(history, f, indent=4)
        except IOError as e:
            messagebox.showerror("Save Error", f"Could not save history to {file_path}: {e}")


def load_history(file_path):
    """Generic function to load history from a JSON file."""
    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                messagebox.showwarning("History Error", f"History file '{file_path}' is corrupted. Resetting.")
                return []  # Return empty list if file is corrupted
    return []


def correct_prompt(prompt):
    """Corrects spelling in a given prompt using SpellChecker."""
    spell = SpellChecker()
    corrected_words = []
    for word in prompt.split():
        # Check if word is alphanumeric or just punctuation
        if word.isalnum():
            # If word is not in dictionary, suggest correction
            if word.lower() not in spell:
                correction = spell.correction(word)
                corrected_words.append(correction if correction else word)
            else:
                corrected_words.append(word)
        else:  # Preserve punctuation and special characters
            corrected_words.append(word)
    return ' '.join(corrected_words)


def get_accuracy_score(original, corrected):
    """Calculates a simple accuracy score based on word match."""
    original_words = set(w.lower() for w in original.split() if w.isalnum())
    corrected_words = set(w.lower() for w in corrected.split() if w.isalnum())
    if not original_words:
        return 100 if not corrected_words else 0
    match = len(original_words.intersection(corrected_words))
    return int((match / len(original_words)) * 100)


# ---
# ===== Gemini Chat Session Class =====
class GeminiChatSession:
    """Manages a chat session with the Gemini model."""

    def __init__(self):
        self.messages = []

    def send(self, user_input):
        """Sends user input to Gemini and returns the response."""
        if not user_input.strip():
            raise ValueError("Chat input cannot be empty.")

        # Add user message to history
        self.messages.append({"role": "user", "parts": [user_input]})

        try:
            # Generate content
            response = model.generate_content(self.messages)

            # Check for valid response structure
            if response and response.text:
                gemini_response = response.text.strip()
                self.messages.append({"role": "model", "parts": [gemini_response]})
                return gemini_response
            else:
                raise ValueError("Gemini returned an empty or invalid response.")
        except Exception as e:
            # Re-raise with a more informative message for API errors
            raise RuntimeError(f"Gemini API Error: {e}") from e


# ---
# ===== GUI Class =====
class AICodeEditor:
    """Main application class for the AI Code Assistant GUI."""

    def __init__(self):
        self.window = tk.Tk()
        self.window.title("🧠 AI Code Assistant")
        self.window.geometry("1000x800")  # Increased size for better layout

        self.config = load_config()
        self.project_root = tk.StringVar(value=self.config.get("project_root", os.getcwd()))
        self.current_file = tk.StringVar()
        self.generated_code = ""
        self.original_code_segment = ""  # Store original for diff
        self.chat_session = GeminiChatSession()
        self.is_showing_diff = False  # New state variable to track if diff is active
        self.is_generated_output_editable = False  # New state variable for editability

        # History for generated code (list of strings)
        self.generated_code_history = []
        self.history_index = -1  # Index of the current state in history

        # History for prompts associated with generations (optional)
        self.generation_prompt_history = []

        self.build_ui()
        self.refresh_all_file_menus()  # Initial population of file menus
        self.refresh_history_lists()  # Initial population of history lists
        self._update_undo_redo_buttons()  # Initialize button states

        # Check for API Key presence on startup
        if "YOUR_GEMINI_API_KEY" in API_KEY:
            messagebox.showwarning("API Key Warning",
                                   "Please replace 'YOUR_GEMINI_API_KEY' in the code with your actual Gemini API Key to use AI features.")

    def build_ui(self):
        """Constructs the main user interface with tabs."""
        self.tabs = ttk.Notebook(self.window)

        self.line_reader_tab = tk.Frame(self.tabs)
        self.tabs.add(self.line_reader_tab, text="📄 Line Reader")
        self._build_line_reader_ui(self.line_reader_tab)

        self.ai_tab = tk.Frame(self.tabs)
        self.tabs.add(self.ai_tab, text="🤖 AI Generator")
        self._build_ai_tab_ui(self.ai_tab)

        self.chat_tab = tk.Frame(self.tabs)
        self.tabs.add(self.chat_tab, text="💬 Ask Gemini")
        self._build_chat_tab_ui(self.chat_tab)

        self.tabs.pack(expand=1, fill="both")

        # Project Root Selection in a status bar or dedicated frame
        project_root_frame = tk.Frame(self.window, bd=2, relief=tk.SUNKEN)
        project_root_frame.pack(side=tk.BOTTOM, fill=tk.X, pady=5)
        tk.Label(project_root_frame, text="Project Root:").pack(side=tk.LEFT, padx=5)
        self.project_root_label = tk.Label(project_root_frame, textvariable=self.project_root)
        self.project_root_label.pack(side=tk.LEFT, expand=True, fill=tk.X)
        tk.Button(project_root_frame, text="Change", command=self._select_project_root).pack(side=tk.RIGHT, padx=5)

    def _select_project_root(self):
        """Allows user to select a new project root directory."""
        new_root = filedialog.askdirectory(initialdir=self.project_root.get())
        if new_root:
            self.project_root.set(new_root)
            self.config["project_root"] = new_root
            save_config(self.config)
            self.refresh_all_file_menus()
            messagebox.showinfo("Project Root Changed", f"Project root set to: {new_root}")

    def _build_line_reader_ui(self, parent):
        """Builds the UI for the Line Reader tab."""
        file_selection_frame = tk.Frame(parent, pady=5)
        file_selection_frame.pack(fill=tk.X)
        tk.Label(file_selection_frame, text="Select File:").pack(side=tk.LEFT, padx=5)
        # Using ttk.Combobox for better look and searchability
        self.line_reader_file_menu = ttk.Combobox(file_selection_frame, textvariable=self.current_file,
                                                  state="readonly")
        self.line_reader_file_menu.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=5)
        tk.Button(file_selection_frame, text="Refresh Files", command=self.refresh_all_file_menus).pack(side=tk.LEFT,
                                                                                                        padx=5)

        line_range_frame = tk.Frame(parent, pady=5)
        line_range_frame.pack(fill=tk.X)
        tk.Label(line_range_frame, text="Start Line:").pack(side=tk.LEFT, padx=5)
        self.start_line_entry = tk.Entry(line_range_frame, width=8)
        self.start_line_entry.pack(side=tk.LEFT, padx=2)
        tk.Label(line_range_frame, text="End Line:").pack(side=tk.LEFT, padx=5)
        self.end_line_entry = tk.Entry(line_range_frame, width=8)
        self.end_line_entry.pack(side=tk.LEFT, padx=2)
        tk.Button(line_range_frame, text="Load Code", command=self.load_code_segment).pack(side=tk.LEFT, padx=10)

        tk.Label(parent, text="Code Viewer:").pack(anchor=tk.W, padx=10, pady=2)
        self.code_viewer = scrolledtext.ScrolledText(parent, height=25, font=("Consolas", 10), wrap=tk.WORD)
        self.code_viewer.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        self.code_viewer.config(state=tk.DISABLED)  # Make read-only

    def _build_ai_tab_ui(self, parent):
        """Builds the UI for the AI Generator tab."""
        # File and Range Selection
        file_range_frame = tk.Frame(parent, pady=5)
        file_range_frame.pack(fill=tk.X)

        tk.Label(file_range_frame, text="Select File:").pack(side=tk.LEFT, padx=5)
        self.ai_file_combobox = ttk.Combobox(file_range_frame, textvariable=self.current_file, state="readonly")
        self.ai_file_combobox.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=5)
        tk.Button(file_range_frame, text="Refresh Files", command=self.refresh_all_file_menus).pack(side=tk.LEFT,
                                                                                                    padx=5)

        tk.Label(file_range_frame, text="Start Line:").pack(side=tk.LEFT, padx=5)
        self.ai_start_line_entry = tk.Entry(file_range_frame, width=8)
        self.ai_start_line_entry.pack(side=tk.LEFT, padx=2)
        tk.Label(file_range_frame, text="End Line:").pack(side=tk.LEFT, padx=5)
        self.ai_end_line_entry = tk.Entry(file_range_frame, width=8)
        self.ai_end_line_entry.pack(side=tk.LEFT, padx=2)

        # Prompt Input
        tk.Label(parent, text="Your Prompt (Spell-checked & Accurate):").pack(anchor=tk.W, padx=10, pady=5)
        self.prompt_input = scrolledtext.ScrolledText(parent, height=6, font=("Consolas", 11), wrap=tk.WORD)
        self.prompt_input.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        self.prompt_input.bind("<KeyRelease>", self._check_prompt_spelling)  # Live spell check

        self.accuracy_label = tk.Label(parent, text="Prompt accuracy: --%", font=("Helvetica", 10, "italic"), fg="gray")
        self.accuracy_label.pack(anchor=tk.E, padx=10)

        # Generation and Action Buttons
        button_frame = tk.Frame(parent)
        button_frame.pack(pady=8)
        self.generate_button = tk.Button(button_frame, text="✨ Generate AI Code", command=self.generate_ai_code,
                                         bg="#4caf50", fg="white", font=("Helvetica", 10, "bold"), relief=tk.RAISED)
        self.generate_button.pack(side=tk.LEFT, padx=10)
        # NEW: Generate Validation Task Button
        self.generate_validation_button = tk.Button(button_frame, text="🤖 Generate Validation Task",
                                                    command=self._generate_validation_task, bg="#9c27b0", fg="white",
                                                    font=("Helvetica", 10, "bold"), relief=tk.RAISED)
        self.generate_validation_button.pack(side=tk.LEFT, padx=10)
        # Undo Button
        self.undo_button = tk.Button(button_frame, text="⏪ Undo", command=self.undo_generation, state=tk.DISABLED,
                                     bg="#f44336", fg="white", font=("Helvetica", 10, "bold"))
        self.undo_button.pack(side=tk.LEFT, padx=10)
        # Redo Button
        self.redo_button = tk.Button(button_frame, text="⏩ Redo", command=self.redo_generation, state=tk.DISABLED,
                                     bg="#008CBA", fg="white", font=("Helvetica", 10, "bold"))
        self.redo_button.pack(side=tk.LEFT, padx=10)

        # Generated Output and Diff View
        tk.Label(parent, text="Generated Output / Diff View:").pack(anchor=tk.W, padx=10, pady=2)
        self.generated_output = scrolledtext.ScrolledText(parent, height=15, font=("Consolas", 10), bg="#f0f0f0",
                                                          wrap=tk.WORD)
        self.generated_output.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        self.generated_output.config(state=tk.DISABLED)  # Start as read-only

        action_frame = tk.Frame(parent)
        action_frame.pack(pady=10)
        self.apply_button = tk.Button(action_frame, text="✅ Apply Code", command=self.apply_generated_code,
                                      bg="#2196f3", fg="white", font=("Helvetica", 10, "bold"), state=tk.DISABLED)
        self.apply_button.pack(side=tk.LEFT, padx=10)
        self.cancel_button = tk.Button(action_frame, text="❌ Clear Output", command=self.clear_generated_code,
                                       bg="#e91e63", fg="white", font=("Helvetica", 10, "bold"))
        self.cancel_button.pack(side=tk.LEFT, padx=10)
        # New Toggle Diff/Code button
        self.toggle_diff_button = tk.Button(action_frame, text="View Diff", command=self.toggle_diff_or_code_view,
                                            bg="#607d8b", fg="white", font=("Helvetica", 10, "bold"), state=tk.DISABLED)
        self.toggle_diff_button.pack(side=tk.LEFT, padx=10)
        # New Edit Generated Code button
        self.edit_generated_code_button = tk.Button(action_frame, text="Edit Generated",
                                                    command=self.toggle_generated_output_editability, bg="#8bc34a",
                                                    fg="white", font=("Helvetica", 10, "bold"), state=tk.DISABLED)
        self.edit_generated_code_button.pack(side=tk.LEFT, padx=10)

        # Prompt History
        tk.Label(parent, text="Prompt History (Double-click to use):").pack(anchor=tk.W, padx=10, pady=5)
        self.prompt_history_box = tk.Listbox(parent, height=6)
        self.prompt_history_box.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        self.prompt_history_box.bind("<Double-Button-1>", self._use_history_prompt)

    def _build_chat_tab_ui(self, parent):
        """Builds the UI for the Ask Gemini tab."""
        tk.Label(parent, text="Ask Gemini Anything:").pack(anchor=tk.W, padx=10, pady=5)
        self.chat_input = scrolledtext.ScrolledText(parent, height=5, font=("Consolas", 11), wrap=tk.WORD)
        self.chat_input.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        button_frame = tk.Frame(parent)
        button_frame.pack(pady=5)
        self.ask_gemini_button = tk.Button(button_frame, text="💬 Ask Gemini", command=self.ask_question, bg="#2196f3",
                                           fg="white", font=("Helvetica", 10, "bold"))
        self.ask_gemini_button.pack(side=tk.LEFT, padx=5)
        tk.Button(button_frame, text="💾 Save Question", command=self.save_chat_history_question, bg="#ff9800",
                  fg="white", font=("Helvetica", 10, "bold")).pack(side=tk.LEFT, padx=5)
        tk.Button(button_frame, text="🧹 Clear Chat", command=self.clear_chat, bg="#e91e63", fg="white",
                  font=("Helvetica", 10, "bold")).pack(side=tk.LEFT, padx=5)

        tk.Label(parent, text="Gemini Response:").pack(anchor=tk.W, padx=10, pady=5)
        self.chat_output = scrolledtext.ScrolledText(parent, height=15, font=("Consolas", 10), bg="#f0f0f0",
                                                     wrap=tk.WORD)
        self.chat_output.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        self.chat_output.config(state=tk.DISABLED)

        tk.Label(parent, text="Saved Questions (Double-click to use):").pack(anchor=tk.W, padx=10, pady=5)
        self.chat_history_box = tk.Listbox(parent, height=6)
        self.chat_history_box.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)
        self.chat_history_box.bind("<Double-Button-1>", self._use_saved_chat_question)

    def _check_prompt_spelling(self, event=None):
        """Checks spelling of the prompt and updates accuracy label."""
        current_prompt = self.prompt_input.get("1.0", tk.END).strip()
        if current_prompt:
            corrected = correct_prompt(current_prompt)
            accuracy = get_accuracy_score(current_prompt, corrected)
            self.accuracy_label.config(text=f"Prompt accuracy: {accuracy}% ({corrected})")
        else:
            self.accuracy_label.config(text="Prompt accuracy: --%")

    def _validate_line_input(self, start_entry, end_entry):
        """Validates start and end line number inputs."""
        try:
            start_line = int(start_entry.get())
            end_line = int(end_entry.get())
            if not (start_line >= 1 and end_line >= start_line):
                raise ValueError("Start line must be >= 1 and End line >= Start line.")
            return start_line, end_line
        except ValueError as e:
            messagebox.showerror("Invalid Input", f"Please enter valid positive integers for line numbers. {e}")
            return None, None

    def load_code_segment(self):
        """Loads a specified code segment into the code viewer."""
        file = self.current_file.get()
        if not file or not os.path.exists(file):
            messagebox.showwarning("File Not Selected", "Please select a valid file first.")
            return

        start, end = self._validate_line_input(self.start_line_entry, self.end_line_entry)
        if start is None:
            return

        try:
            with open(file, "r", encoding="utf-8") as f:
                lines = f.readlines()

            if start > len(lines) and len(lines) > 0:  # If start is beyond existing lines but file isn't empty
                messagebox.showwarning("Line Error",
                                       f"Start line ({start}) is beyond total lines ({len(lines)}). No code will be loaded.")
                segment = ""
            elif end > len(lines):
                # Adjust end to be max lines if it exceeds file length
                messagebox.showinfo("Line Adjustment",
                                    f"End line ({end}) exceeds total lines ({len(lines)}). Adjusting to {len(lines)}.")
                end = len(lines)
                segment = "".join(lines[:end])  # Corrected slicing
            elif start > 0 and end <= len(lines) and start <= end:
                segment = "".join(lines[(start - 1):end])
            else:
                segment = ""

            self.code_viewer.config(state=tk.NORMAL)  # Enable editing
            self.code_viewer.delete("1.0", tk.END)
            self.code_viewer.insert(tk.END, segment)
            self.code_viewer.config(state=tk.DISABLED)  # Disable editing
        except Exception as e:
            messagebox.showerror("File Error", f"Failed to load code segment: {e}")

    def _prepare_for_generation(self):
        """Common pre-generation checks and UI updates."""
        if "YOUR_GEMINI_API_KEY" in API_KEY:
            messagebox.showwarning("API Key Missing",
                                   "Please replace 'YOUR_GEMINI_API_KEY' with your actual Gemini API Key in the code to use AI features.")
            return False

        file = self.current_file.get()
        if not file or not os.path.exists(file):
            messagebox.showwarning("File Not Selected", "Please select a valid file for AI generation.")
            return False

        start, end = self._validate_line_input(self.ai_start_line_entry, self.ai_end_line_entry)
        if start is None:
            return False, None, None

        prompt = self.prompt_input.get("1.0", tk.END).strip()
        if not prompt:
            messagebox.showwarning("Input Required", "Please enter a prompt for AI generation.")
            return False

        # Disable buttons and show loading
        self.generate_button.config(state=tk.DISABLED)
        self.generate_validation_button.config(state=tk.DISABLED)  # Disable validation button too
        self.apply_button.config(state=tk.DISABLED)
        self.cancel_button.config(state=tk.DISABLED)
        self.toggle_diff_button.config(state=tk.DISABLED)
        self.edit_generated_code_button.config(state=tk.DISABLED)
        self.undo_button.config(state=tk.DISABLED)
        self.redo_button.config(state=tk.DISABLED)

        self.generated_output.config(state=tk.NORMAL)
        self.generated_output.delete("1.0", tk.END)
        self.generated_output.insert(tk.END, "Generating code... Please wait.\n")
        self.generated_output.config(state=tk.DISABLED)
        self.window.update_idletasks()  # Force UI update
        return True, file, start, end, prompt

    def _finalize_generation(self, success, generated_code="", prompt_text=""):
        """Common post-generation UI updates."""
        self.generate_button.config(state=tk.NORMAL)
        self.generate_validation_button.config(state=tk.NORMAL)  # Enable validation button
        self.cancel_button.config(state=tk.NORMAL)
        self._update_undo_redo_buttons()

        if success:
            self.generated_code = generated_code
            self._add_to_history(self.generated_code, prompt_text)
            self.show_generated_code()
            self.apply_button.config(state=tk.NORMAL)
            self.toggle_diff_button.config(state=tk.NORMAL)
            self.edit_generated_code_button.config(state=tk.NORMAL)
            messagebox.showinfo("AI Generation Complete", "AI code generated successfully!")
        else:
            self.clear_generated_code(reset_history=False)  # Clear message, don't reset history

    def generate_ai_code(self):
        """Generates AI code based on the prompt and selected code segment."""
        status, file, start, end, prompt = self._prepare_for_generation()
        if not status:
            return

        try:
            with open(file, "r", encoding="utf-8") as f:
                lines = f.readlines()

            if start > len(lines) and len(lines) > 0:
                messagebox.showwarning("Line Error",
                                       f"Start line ({start}) is beyond total lines ({len(lines)}) for AI generation. Cannot generate code for non-existent lines.")
                self._finalize_generation(False)
                return
            if end > len(lines):
                messagebox.showinfo("Line Adjustment",
                                    f"End line ({end}) exceeds total lines ({len(lines)}). Adjusting to {len(lines)} for generation.")
                end = len(lines)

            self.original_code_segment = "".join(lines[(start - 1):end])

            corrected_prompt_text = correct_prompt(prompt)
            save_history(PROMPT_HISTORY_FILE, corrected_prompt_text)
            self.refresh_history_lists()

            combined_prompt = f"Refactor or improve the following code segment, keeping the original context and structure as much as possible, unless specifically told to change. Only provide the code, no extra explanations or markdown code fences (like ```python or ```):\n\n```\n{self.original_code_segment}\n```\n\nPrompt:\n{corrected_prompt_text}"

            response = model.generate_content(combined_prompt)

            cleaned_response = response.text.strip()
            if cleaned_response.startswith("```") and cleaned_response.endswith("```"):
                cleaned_response = "\n".join(cleaned_response.splitlines()[1:-1])
            elif cleaned_response.startswith("```python") and cleaned_response.endswith("```"):
                cleaned_response = "\n".join(cleaned_response.splitlines()[1:-1])

            self._finalize_generation(True, cleaned_response.strip(), corrected_prompt_text)

        except RuntimeError as e:
            messagebox.showerror("Gemini Error", f"Failed to generate code: {e}")
            self._finalize_generation(False)
        except Exception as e:
            messagebox.showerror("An Error Occurred", f"Failed to generate code: {e}")
            self._finalize_generation(False)

    def _generate_validation_task(self):
        """Generates Robot Framework validation code for the selected segment."""
        status, file, start, end, user_prompt = self._prepare_for_generation()
        if not status:
            return

        # Ensure it's a Robot Framework file for this specific task
        if not file.endswith('.robot'):
            messagebox.showwarning("File Type Mismatch",
                                   "Validation task generation is primarily for Robot Framework files (.robot). Please select a .robot file.")
            self._finalize_generation(False)
            return

        try:
            with open(file, "r", encoding="utf-8") as f:
                lines = f.readlines()

            if start > len(lines) and len(lines) > 0:
                messagebox.showwarning("Line Error",
                                       f"Start line ({start}) is beyond total lines ({len(lines)}) for validation generation. Cannot generate code for non-existent lines.")
                self._finalize_generation(False)
                return
            if end > len(lines):
                messagebox.showinfo("Line Adjustment",
                                    f"End line ({end}) exceeds total lines ({len(lines)}). Adjusting to {len(lines)} for validation generation.")
                end = len(lines)

            self.original_code_segment = "".join(lines[(start - 1):end])

            # Specific prompt for Robot Framework validation
            validation_prompt = f"""Use the latest Robot Framework syntax (version 6+).

For each UI action (e.g., input, click, wait):
- Use IF/ELSE condition blocks.
- Always validate using `Run Keyword And Return Status` or direct keyword calls when applicable.
- If action is successful:
  - Take screenshot first with a contextual name, e.g., `screenshot_input_username`
  - Log success message to console like ` Successfully input username`
- If action fails:
  - Take failure screenshot like `screenshot_failed_input_username`
  - Log error to console like ` Failed to input username`
  - Fail the test with msg 
Use only meaningful variable names (like `input_username_field`, `click_login_button`), **no XPath/CSS locators**.
Dont give remining matter do directly the task and don,t setting,keywords,testcases e.t.c   
Structure code cleanly and consistently.

Here is the code segment to modify:
```robotframework
{self.original_code_segment}
```
"""
            # Prepend user's prompt if they provided one, otherwise use the default validation prompt
            final_prompt = f"{user_prompt}\n\n{validation_prompt}" if user_prompt else validation_prompt

            corrected_prompt_text = correct_prompt(final_prompt)
            save_history(PROMPT_HISTORY_FILE, corrected_prompt_text)
            self.refresh_history_lists()

            response = model.generate_content(corrected_prompt_text)

            cleaned_response = response.text.strip()
            # Clean up potential markdown code blocks from Gemini's response
            if cleaned_response.startswith("```") and cleaned_response.endswith("```"):
                cleaned_response = "\n".join(cleaned_response.splitlines()[1:-1])
            elif cleaned_response.startswith("```robotframework") and cleaned_response.endswith("```"):
                cleaned_response = "\n".join(cleaned_response.splitlines()[1:-1])

            self._finalize_generation(True, cleaned_response.strip(), corrected_prompt_text)

        except RuntimeError as e:
            messagebox.showerror("Gemini Error", f"Failed to generate validation code: {e}")
            self._finalize_generation(False)
        except Exception as e:
            messagebox.showerror("An Error Occurred", f"Failed to generate validation code: {e}")
            self._finalize_generation(False)

    def _add_to_history(self, generated_code, prompt):
        """Adds the generated code and prompt to the history."""
        # If we are making a new generation after undoing, clear the forward history
        if self.history_index < len(self.generated_code_history) - 1:
            self.generated_code_history = self.generated_code_history[:self.history_index + 1]
            self.generation_prompt_history = self.generation_prompt_history[:self.history_index + 1]

        self.generated_code_history.append(generated_code)
        self.generation_prompt_history.append(prompt)
        self.history_index = len(self.generated_code_history) - 1
        self._update_undo_redo_buttons()

    def undo_generation(self):
        """Reverts to the previous generated code in history."""
        if self.history_index > 0:
            self.history_index -= 1
            self.generated_code = self.generated_code_history[self.history_index]
            self.prompt_input.delete("1.0", tk.END)
            self.prompt_input.insert(tk.END, self.generation_prompt_history[self.history_index])
            self.show_generated_code()
            self._update_undo_redo_buttons()
        else:
            messagebox.showinfo("Undo", "No previous generation to undo.")

    def redo_generation(self):
        """Re-applies the next generated code in history (if available)."""
        if self.history_index < len(self.generated_code_history) - 1:
            self.history_index += 1
            self.generated_code = self.generated_code_history[self.history_index]
            self.prompt_input.delete("1.0", tk.END)
            self.prompt_input.insert(tk.END, self.generation_prompt_history[self.history_index])
            self.show_generated_code()
            self._update_undo_redo_buttons()
        else:
            messagebox.showinfo("Redo", "No further generation to redo.")

    def _update_undo_redo_buttons(self):
        """Updates the state of the Undo and Redo buttons based on history."""
        if self.history_index > 0:
            self.undo_button.config(state=tk.NORMAL)
        else:
            self.undo_button.config(state=tk.DISABLED)

        if self.history_index < len(self.generated_code_history) - 1:
            self.redo_button.config(state=tk.NORMAL)
        else:
            self.redo_button.config(state=tk.DISABLED)

    def apply_generated_code(self):
        """Applies the generated code to the selected file."""
        # Get the *current* content from the generated_output box, allowing for edits
        code_to_apply = self.generated_output.get("1.0", tk.END).strip()

        if not code_to_apply:
            messagebox.showwarning("No Code", "No generated code (or edited code) to apply.")
            return

        file = self.current_file.get()
        if not file or not os.path.exists(file):
            messagebox.showwarning("File Not Selected", "Please select a valid file to apply code.")
            return

        start, end = self._validate_line_input(self.ai_start_line_entry, self.ai_end_line_entry)
        if start is None:
            return

        # Double-check against actual file length just in case lines changed
        try:
            with open(file, "r", encoding="utf-8") as f:
                current_lines = f.readlines()
        except IOError as e:
            messagebox.showerror("File Read Error", f"Could not read file to apply changes: {e}")
            return

        # Adjust start/end lines to be within current file bounds if they somehow got out of sync
        # THIS IS THE FIXED BLOCK
        if start > len(current_lines) and len(current_lines) > 0:
            messagebox.showwarning("Line Mismatch",
                                   "Start line is beyond current file length. Applying generated code at the end of the file.")
            start = len(current_lines) + 1
            end = start  # Ensure end is also past the file
        elif start > len(current_lines) and len(current_lines) == 0:
            messagebox.showwarning("Empty File", "File is empty. Applying generated code as the entire content.")
            start = 1
            end = 0  # To represent inserting at the beginning of an empty file
        if end > len(current_lines):
            messagebox.showinfo("Line Adjustment",
                                f"End line ({end}) exceeds current file length ({len(current_lines)}). Adjusting to {len(current_lines)}.")
            end = len(current_lines)
        # END FIXED BLOCK

        confirmation_message = (
            f"Are you sure you want to replace lines {start}-{end} in '{file}' "
            "with the generated code?\n\n"
            "⚠️ This action is irreversible without a manual backup. Consider backing up your file before proceeding."
        )
        if not messagebox.askyesno("Confirm Apply", confirmation_message):
            return

        try:
            new_code_lines = code_to_apply.splitlines(keepends=True)

            # Construct the updated content
            updated_lines = current_lines[:start - 1] + new_code_lines + current_lines[end:]

            with open(file, "w", encoding="utf-8") as f:
                f.writelines(updated_lines)

            messagebox.showinfo("Success", "Generated code applied successfully!")
            self.clear_generated_code()  # Clear output after applying
            self.apply_button.config(state=tk.DISABLED)  # Disable apply after applying
            self.toggle_diff_button.config(state=tk.DISABLED)
            self.edit_generated_code_button.config(state=tk.DISABLED)
            self.is_generated_output_editable = False
            self.edit_generated_code_button.config(text="Edit Generated")
            self._update_undo_redo_buttons()  # Update button states after applying
        except Exception as e:
            messagebox.showerror("File Write Error", f"Failed to apply generated code: {e}")

    def clear_generated_code(self, reset_history=True):
        """Clears the generated code output and resets related state.
        If reset_history is True, it also clears the undo/redo history."""
        self.generated_output.config(state=tk.NORMAL)
        self.generated_output.delete("1.0", tk.END)
        self.generated_output.config(state=tk.DISABLED)
        self.generated_code = ""
        self.original_code_segment = ""
        self.is_showing_diff = False  # Reset diff state
        self.is_generated_output_editable = False  # Reset editability
        self.apply_button.config(state=tk.DISABLED)
        self.toggle_diff_button.config(state=tk.DISABLED)
        self.toggle_diff_button.config(text="View Diff")  # Reset button text
        self.edit_generated_code_button.config(state=tk.DISABLED)
        self.edit_generated_code_button.config(text="Edit Generated")  # Reset button text

        if reset_history:
            self.generated_code_history = []
            self.generation_prompt_history = []
            self.history_index = -1
        self._update_undo_redo_buttons()  # Update button states

    def show_generated_code(self):
        """Displays the raw generated code in the output area."""
        self.generated_output.config(state=tk.NORMAL)
        self.generated_output.delete("1.0", tk.END)
        self.generated_output.insert(tk.END, self.generated_code)
        if not self.is_generated_output_editable:  # Only disable if not in edit mode
            self.generated_output.config(state=tk.DISABLED)
        self.is_showing_diff = False
        self.toggle_diff_button.config(text="View Diff")  # Set button text to offer diff

    def show_diff_view(self):
        """Displays a diff between the original and generated code."""
        if not self.generated_code or not self.original_code_segment:
            messagebox.showwarning("No Data",
                                   "Generate code and ensure an original segment was loaded to view the diff.")
            return

        diff_lines = difflib.unified_diff(
            self.original_code_segment.splitlines(keepends=True),
            self.generated_code.splitlines(keepends=True),
            fromfile='original',
            tofile='generated',
            lineterm=''  # Prevent extra newlines
        )
        diff_text = "".join(diff_lines)

        self.generated_output.config(state=tk.NORMAL)
        self.generated_output.delete("1.0", tk.END)
        self.generated_output.insert(tk.END, diff_text)
        self.generated_output.config(state=tk.DISABLED)  # Diff view is always read-only
        self.is_showing_diff = True
        self.toggle_diff_button.config(text="View Code")  # Set button text to offer code

        # Tagging for diff colors (optional but nice)
        self.generated_output.tag_configure("insert", foreground="green")
        self.generated_output.tag_configure("delete", foreground="red")
        self.generated_output.tag_configure("header", foreground="blue")

        for line_num, line in enumerate(diff_text.splitlines(keepends=True), 1):
            if line.startswith('+'):
                self.generated_output.tag_add("insert", f"{line_num}.0", f"{line_num}.end")
            elif line.startswith('-'):
                self.generated_output.tag_add("delete", f"{line_num}.0", f"{line_num}.end")
            elif line.startswith('@@'):
                self.generated_output.tag_add("header", f"{line_num}.0", f"{line_num}.end")

    def toggle_diff_or_code_view(self):
        """Toggles between showing the generated code and its diff."""
        if self.is_showing_diff:
            self.show_generated_code()
        else:
            self.show_diff_view()

    def toggle_generated_output_editability(self):
        """Toggles the editability of the generated output text box."""
        if self.is_generated_output_editable:
            self.generated_output.config(state=tk.DISABLED)
            self.is_generated_output_editable = False
            self.edit_generated_code_button.config(text="Edit Generated")
        else:
            self.generated_output.config(state=tk.NORMAL)
            self.is_generated_output_editable = True
            self.edit_generated_code_button.config(text="Lock Generated")  # Change button text

    def refresh_all_file_menus(self):
        """Refreshes the file lists in all relevant comboboxes."""
        project_files = get_project_files(self.project_root.get())
        # Convert absolute paths to relative paths for display, but store absolute
        display_files = [os.path.relpath(f, self.project_root.get()) for f in project_files]

        # Store a mapping from display path to full path
        self._file_paths_map = {rel_path: full_path for rel_path, full_path in zip(display_files, project_files)}

        self.line_reader_file_menu['values'] = display_files
        self.ai_file_combobox['values'] = display_files
        if display_files:
            # If a file was previously selected and still exists, keep it
            current_selected = self.current_file.get()
            if current_selected not in display_files:
                self.current_file.set(display_files[0])  # Default to first file if current is invalid
        else:
            self.current_file.set("")  # Clear selection if no files

        # Update the textvariable to the full path when selection changes
        def update_full_path(event):
            selected_display_path = self.line_reader_file_menu.get()
            if selected_display_path in self._file_paths_map:
                self.current_file.set(self._file_paths_map[selected_display_path])
            else:
                self.current_file.set("")  # Clear if not found

        self.line_reader_file_menu.bind("<<ComboboxSelected>>", update_full_path)
        self.ai_file_combobox.bind("<<ComboboxSelected>>", update_full_path)

    def refresh_history_lists(self):
        """Refreshes the prompt and chat history listboxes."""
        self.prompt_history_box.delete(0, tk.END)
        prompts = load_history(PROMPT_HISTORY_FILE)
        for prompt in reversed(prompts):  # Show most recent first
            self.prompt_history_box.insert(tk.END, prompt)

        self.chat_history_box.delete(0, tk.END)
        chat_questions = load_history(CHAT_HISTORY_FILE)
        for question in reversed(chat_questions):  # Show most recent first
            self.chat_history_box.insert(tk.END, question)

    def _use_history_prompt(self, event):
        """Loads a selected prompt from history into the prompt input."""
        selected_index = self.prompt_history_box.curselection()
        if selected_index:
            prompt_text = self.prompt_history_box.get(selected_index[0])
            self.prompt_input.delete("1.0", tk.END)
            self.prompt_input.insert(tk.END, prompt_text)
            self._check_prompt_spelling()  # Update accuracy label

    def _use_saved_chat_question(self, event):
        """Loads a selected chat question from history into the chat input."""
        selected_index = self.chat_history_box.curselection()
        if selected_index:
            question_text = self.chat_history_box.get(selected_index[0])
            self.chat_input.delete("1.0", tk.END)
            self.chat_input.insert(tk.END, question_text)

    def ask_question(self):
        """Sends a question to Gemini and displays the response."""
        # --- Pre-check API Key ---
        if "YOUR_GEMINI_API_KEY" in API_KEY:
            messagebox.showwarning("API Key Missing",
                                   "Please replace 'YOUR_GEMINI_API_KEY' with your actual Gemini API Key in the code to use AI features.")
            return
        # --- End Pre-check ---

        question = self.chat_input.get("1.0", tk.END).strip()
        if not question:
            messagebox.showwarning("Input Required", "Please enter a question for Gemini.")
            return

        # Disable button and show loading
        self.ask_gemini_button.config(state=tk.DISABLED)
        self.chat_output.config(state=tk.NORMAL)
        self.chat_output.delete("1.0", tk.END)
        self.chat_output.insert(tk.END, "Thinking... Please wait.\n")
        self.chat_output.config(state=tk.DISABLED)
        self.window.update_idletasks()  # Force UI update

        try:
            response = self.chat_session.send(question)
            self.chat_output.config(state=tk.NORMAL)
            self.chat_output.delete("1.0", tk.END)
            self.chat_output.insert(tk.END, response)
            self.chat_output.config(state=tk.DISABLED)
            messagebox.showinfo("Gemini Response", "Gemini has responded!")
        except RuntimeError as e:  # Catch specifically for API errors from GeminiChatSession
            messagebox.showerror("Gemini Error", f"Failed to get response from Gemini: {e}")
            self.chat_output.config(state=tk.NORMAL)
            self.chat_output.delete("1.0", tk.END)
            self.chat_output.insert(tk.END, f"Error: {e}\n")
            self.chat_output.config(state=tk.DISABLED)
        except Exception as e:
            messagebox.showerror("An Error Occurred", f"Failed to get response from Gemini: {e}")
            self.chat_output.config(state=tk.NORMAL)
            self.chat_output.delete("1.0", tk.END)
            self.chat_output.insert(tk.END, f"Error: {e}\n")
            self.chat_output.config(state=tk.DISABLED)
        finally:
            self.ask_gemini_button.config(state=tk.NORMAL)

    def save_chat_history_question(self):
        """Saves the current chat input question to history."""
        question = self.chat_input.get("1.0", tk.END).strip()
        if question:
            save_history(CHAT_HISTORY_FILE, question)
            self.refresh_history_lists()
            messagebox.showinfo("History Saved", "Question saved to chat history.")
        else:
            messagebox.showwarning("No Input", "Please enter a question to save.")

    def clear_chat(self):
        """Clears the chat input and output fields."""
        self.chat_input.delete("1.0", tk.END)
        self.chat_output.config(state=tk.NORMAL)
        self.chat_output.delete("1.0", tk.END)
        self.chat_output.config(state=tk.DISABLED)
        self.chat_session = GeminiChatSession()  # Reset chat session history

    def run(self):
        """Starts the Tkinter event loop."""
        self.window.mainloop()


# ---
# ===== Main Execution =====
if __name__ == "__main__":
    app = AICodeEditor()
    app.run()

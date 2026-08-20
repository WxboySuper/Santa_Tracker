import React, { useRef } from 'react';
import './DIYDiscussionEditor.css';

interface DIYDiscussionEditorProps {
  content: string;
  onChange: (content: string) => void;
}

// A simple markdown editor for the forecast discussion, which provides a textarea for input and a toolbar with buttons to insert markdown formatting for bold, italic, and headings. It manages the cursor position to insert formatting around selected text and updates the content state as the user types or applies formatting. The editor also displays a character count below the textarea.
const DIYDiscussionEditor: React.FC<DIYDiscussionEditorProps> = ({ content, onChange }) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Function to insert markdown formatting at the current cursor position or around the selected text in the textarea. It takes the markdown syntax to insert before and after the selected text, updates the content state with the new formatted text, and restores the cursor position after insertion.
  const insertFormatting = (before: string, after: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const newText = 
      content.substring(0, start) + 
      before + selectedText + after + 
      content.substring(end);
    
    onChange(newText);
    
    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        end + before.length
      );
    }, 0);
  };

  // Handler for inserting bold markdown syntax, which adds "**" before and after the selected text. It uses the insertFormatting function to apply the formatting and manages the cursor position accordingly.
  const handleBold = () => insertFormatting('**', '**');
  // Handler for inserting italic markdown syntax, which adds "*" before and after the selected text. It uses the insertFormatting function to apply the formatting and manages the cursor position accordingly.
  const handleItalic = () => insertFormatting('*', '*');
  // Handler for inserting a level 1 heading markdown syntax, which adds "# " at the beginning of the line. It uses the insertFormatting function to apply the formatting and manages the cursor position accordingly.
  const handleH1 = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    insertFormatting('\n# ', '');
  };
  // Handler for inserting a level 2 heading markdown syntax, which adds "## " at the beginning of the line. It uses the insertFormatting function to apply the formatting and manages the cursor position accordingly.
  const handleH2 = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    insertFormatting('\n## ', '');
  };
  // Handler for inserting a level 3 heading markdown syntax, which adds "### " at the beginning of the line. It uses the insertFormatting function to apply the formatting and manages the cursor position accordingly.
  const handleH3 = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    insertFormatting('\n### ', '');
  };

  // Handle text changes in the textarea
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="diy-editor">
      <div className="diy-toolbar">
        <button type="button" onClick={handleBold} title="Bold (Ctrl+B)" className="toolbar-button">
          <strong>B</strong>
        </button>
        <button type="button" onClick={handleItalic} title="Italic (Ctrl+I)" className="toolbar-button">
          <em>I</em>
        </button>
        <div className="toolbar-divider" />
        <button type="button" onClick={handleH1} title="Heading 1" className="toolbar-button">
          H1
        </button>
        <button type="button" onClick={handleH2} title="Heading 2" className="toolbar-button">
          H2
        </button>
        <button type="button" onClick={handleH3} title="Heading 3" className="toolbar-button">
          H3
        </button>
      </div>
      
      <textarea
        ref={textareaRef}
        className="diy-textarea"
        value={content}
        onChange={handleTextChange}
        placeholder="Write your forecast discussion here...

You can use basic markdown formatting:
**bold text** for emphasis
*italic text* for nuance
# Large Heading
## Medium Heading
### Small Heading

Example structure:
...SUMMARY...
Brief overview of the severe weather threat.

...METEOROLOGICAL SETUP...
Describe the synoptic pattern.

...SEVERE WEATHER EXPECTATIONS...
Detail the expected hazards and probabilities."
        spellCheck={true}
      />
      
      <div className="character-count">
        {content.length.toLocaleString()} characters
      </div>
    </div>
  );
};

export default DIYDiscussionEditor;

import React from 'react';

interface DrawingToolsHelpProps {
  isExportDisabled: boolean;
  isSaveLoadDisabled: boolean;
  isSaved: boolean;
}

const DrawingToolsHelp: React.FC<DrawingToolsHelpProps> = ({
  isExportDisabled,
  isSaveLoadDisabled,
  isSaved
}) => {
  return (
    <div className="tools-help">
      <p>
        <strong>Drawing Instructions:</strong> Select an outlook type and probability, then use the drawing tools on the map to create your forecast areas.
      </p>
      <p>
        <strong>Click on any drawn area to delete it.</strong>
      </p>
      {isExportDisabled && (
        <p className="unsaved-warning">
          ⚠️ Export feature is temporarily unavailable due to an issue. See <a href="https://github.com/wxboysuper/graphical-forecast-creator/issues/32" target="_blank" rel="noopener noreferrer">GitHub issue #32</a> for more information.
        </p>
      )}
      {isSaveLoadDisabled && (
        <p className="unsaved-warning">
          ⚠️ The save/load features are temporarily unavailable due to an issue.
        </p>
      )}
      {!isSaved && (
        <p className="unsaved-warning">
          ⚠️ You have unsaved changes
        </p>
      )}
    </div>
  );
};

export default DrawingToolsHelp;

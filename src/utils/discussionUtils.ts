import { DiscussionData, GuidedDiscussionData, DayType } from '../types/outlooks';

/**
 * Compiles a DiscussionData object into formatted text output
 * for GFC forecast discussions
 */
export const compileDiscussionToText = (
  discussion: DiscussionData,
  day: DayType
): string => {
  const lines: string[] = [];
  
  // Header section
  lines.push('Graphical Forecast Creator');
  lines.push(`Day ${day} Severe Weather Outlook Discussion`);
  lines.push('');
  
  // Issue time
  const now = new Date();
  const issueTime = now.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
  lines.push(`Issued: ${issueTime}`);
  
  // Valid time range
  const validStart = new Date(discussion.validStart);
  const validEnd = new Date(discussion.validEnd);
  const formatValidTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };
  lines.push(`Valid: ${formatValidTime(validStart)} to ${formatValidTime(validEnd)}`);
  lines.push('');
  
  // Disclaimer
  lines.push('** UNOFFICIAL OUTLOOK - FOR EDUCATIONAL/DEMONSTRATION PURPOSES ONLY **');
  lines.push('');
  lines.push('---');
  lines.push('');
  
  // Discussion content
  if (discussion.mode === 'diy') {
    // DIY mode - use the raw content
    lines.push(discussion.diyContent || '');
  } else {
    // Guided mode - format the structured sections
    const guided = discussion.guidedContent as GuidedDiscussionData;
    
    if (guided.synopsis) {
      lines.push('Synopsis:');
      lines.push('');
      lines.push(guided.synopsis);
      lines.push('');
    }
    
    if (guided.meteorologicalSetup) {
      lines.push('Meteorological Setup:');
      lines.push('');
      lines.push(guided.meteorologicalSetup);
      lines.push('');
    }
    
    if (guided.severeWeatherExpectations) {
      lines.push('Severe Weather Expectations:');
      lines.push('');
      lines.push(guided.severeWeatherExpectations);
      lines.push('');
    }
    
    if (guided.timing) {
      lines.push('Timing:');
      lines.push('');
      lines.push(guided.timing);
      lines.push('');
    }
    
    if (guided.regionalBreakdown) {
      lines.push('Regional Breakdown:');
      lines.push('');
      lines.push(guided.regionalBreakdown);
      lines.push('');
    }
    
    if (guided.additionalConsiderations) {
      lines.push('Additional Considerations:');
      lines.push('');
      lines.push(guided.additionalConsiderations);
      lines.push('');
    }
  }
  
  // Forecaster attribution at the bottom
  lines.push('');
  lines.push('---');
  lines.push('');
  if (discussion.forecasterName) {
    lines.push(`Forecaster: ${discussion.forecasterName}`);
  }
  
  return lines.join('\n');
};

/**
 * Exports the compiled discussion to a text file
 */
export const exportDiscussionToFile = (
  discussion: DiscussionData,
  day: DayType
) => {
  const text = compileDiscussionToText(discussion, day);
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `gfc-discussion-day${day}-${timestamp}.txt`;
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

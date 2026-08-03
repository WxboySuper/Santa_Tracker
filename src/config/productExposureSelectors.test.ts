import * as featureExposure from './featureExposure';
import {
  getFirstExposedOutlookType,
  isAnyOutlookExposed,
  isExportMapExposed,
  isOutlookTypeExposed,
  isSaveLoadExposed,
  isSignificantThreatsExposed,
  shouldActivateEmergencyMode,
} from './productExposureSelectors';

describe('productExposureSelectors', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('reads core product exposure from the registry on the current target', () => {
    expect(isExportMapExposed()).toBe(true);
    expect(isSaveLoadExposed()).toBe(true);
    expect(isSignificantThreatsExposed()).toBe(true);
    expect(isOutlookTypeExposed('tornado')).toBe(true);
    expect(isAnyOutlookExposed()).toBe(true);
    expect(getFirstExposedOutlookType()).toBe('tornado');
    expect(shouldActivateEmergencyMode()).toBe(false);
  });

  test('getFirstExposedOutlookType follows tornado, wind, hail, then categorical priority', () => {
    jest.spyOn(featureExposure, 'isFeatureExposedOnTarget').mockImplementation((_feature, _target) => {
      if (_feature === 'windOutlook') {
        return true;
      }

      return false;
    });

    expect(getFirstExposedOutlookType()).toBe('wind');
  });

  test('activates emergency mode when every outlook is disabled', () => {
    jest.spyOn(featureExposure, 'isFeatureExposedOnTarget').mockReturnValue(false);

    expect(isAnyOutlookExposed()).toBe(false);
    expect(getFirstExposedOutlookType()).toBe('categorical');
    expect(shouldActivateEmergencyMode()).toBe(true);
  });

  test('disables export and save/load independently from registry exposure', () => {
    jest.spyOn(featureExposure, 'isFeatureExposedOnTarget').mockImplementation((feature) => {
      return feature !== 'exportMap' && feature !== 'saveLoad';
    });

    expect(isExportMapExposed()).toBe(false);
    expect(isSaveLoadExposed()).toBe(false);
    expect(isOutlookTypeExposed('tornado')).toBe(true);
  });
});

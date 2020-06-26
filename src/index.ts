import type { API } from 'homebridge';

import { PLATFORM_NAME } from './settings';
import { DenonSerial } from './platform';

/**
 * This method registers the platform with Homebridge
 */
export = (api: API): void => {
  api.registerPlatform(PLATFORM_NAME, DenonSerial);
};

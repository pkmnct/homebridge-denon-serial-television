import { CharacteristicEventTypes } from 'homebridge';
import type {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge';

import { DenonSerial } from './platform';

import { SerialProtocol } from './protocols/serial';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Television {
  private tvService: Service;
  private tvSpeakerService: Service;

  private readonly path: string;
  private readonly serial: SerialProtocol;

  constructor(
    private readonly platform: DenonSerial,
    private readonly accessory: PlatformAccessory,
  ) {
    this.path = accessory.context.device.path || '/dev/ttyUSB0';

    // Initialize Serial Port
    this.serial = new SerialProtocol(this.path, this.platform.log);

    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.Characteristic.Manufacturer,
        accessory.context.device.manufacturer || 'Denon',
      )
      .setCharacteristic(
        this.platform.Characteristic.Model,
        accessory.context.device.model || 'Unknown',
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        accessory.context.device.serial || 'Unknown',
      );

    // get the Television service if it exists, otherwise create a new Television service
    this.tvService =
      this.accessory.getService(this.platform.Service.Television) ??
      this.accessory.addService(this.platform.Service.Television);

    // set the configured name, this is what is displayed as the default name on the Home app
    // we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.tvService.setCharacteristic(
      this.platform.Characteristic.ConfiguredName,
      accessory.context.device.name,
    );

    // set sleep discovery characteristic
    this.tvService.setCharacteristic(
      this.platform.Characteristic.SleepDiscoveryMode,
      this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE,
    );

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Television

    // register handlers for the Active Characteristic (on / off events)
    this.tvService
      .getCharacteristic(this.platform.Characteristic.Active)
      .on(CharacteristicEventTypes.SET, this.setActive.bind(this)) // SET - bind to the `setOn` method below
      .on(CharacteristicEventTypes.GET, this.getActive.bind(this)); // GET - bind to the `getOn` method below

    // register handlers for the ActiveIdentifier Characteristic (input events)
    this.tvService
      .getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .on(CharacteristicEventTypes.SET, this.setActiveIdentifier.bind(this)) // SET - bind to the 'setActiveIdentifier` method below
      .on(CharacteristicEventTypes.GET, this.getActiveIdentifier.bind(this)); // GET - bind to the `getActiveIdentifier` method below

    // get the Television Speaker service if it exists, otherwise create a new Television Speaker service
    this.tvSpeakerService =
      this.accessory.getService(this.platform.Service.TelevisionSpeaker) ??
      this.accessory.addService(this.platform.Service.TelevisionSpeaker);

    // set the configured name for the Television Speaker service, this is what is displayed as the default name on the Home app
    this.tvSpeakerService.setCharacteristic(
      this.platform.Characteristic.ConfiguredName,
      accessory.context.device.name + 'Volume',
    );

    // set the volume control type
    this.tvSpeakerService
      .setCharacteristic(this.platform.Characteristic.Active, this.platform.Characteristic.Active.ACTIVE)
      .setCharacteristic(this.platform.Characteristic.VolumeControlType, this.platform.Characteristic.VolumeControlType.RELATIVE);

    this.tvSpeakerService
      .getCharacteristic(this.platform.Characteristic.Mute)
      .on(CharacteristicEventTypes.SET, this.setMute.bind(this));

    this.tvSpeakerService
      .getCharacteristic(this.platform.Characteristic.VolumeSelector)
      .on(CharacteristicEventTypes.SET, this.setVolume.bind(this));

    // Link the service
    this.tvService.addLinkedService(this.tvSpeakerService);

    // register inputs
    accessory.context.device.inputs && accessory.context.device.inputs.forEach(
      (
        input: {
          name: string;
          type: number; // See InputSourceType from hap-nodejs
          input: string;
        },
        i: number,
      ) => {
        const inputService = accessory.addService(
          this.platform.Service.InputSource,
          input.name,
          input.name,
        );
        inputService
          .setCharacteristic(this.platform.Characteristic.Identifier, i)
          .setCharacteristic(
            this.platform.Characteristic.ConfiguredName,
            input.name,
          )
          .setCharacteristic(
            this.platform.Characteristic.IsConfigured,
            this.platform.Characteristic.IsConfigured.CONFIGURED,
          )
          .setCharacteristic(
            this.platform.Characteristic.InputSourceType,
            input.type,
          );
        this.tvService.addLinkedService(inputService);
      },
    );
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory.
   */
  setActive(value: CharacteristicValue, callback: CharacteristicSetCallback): void {
    this.platform.log.debug('setActive ' + value);
    const command = value ? 'PWON\r' : 'PWSTANDBY\r';

    this.getActive((error, currentValue) => {
      if (error) {
        callback(error);
      } else {
        if (currentValue !== value) {
          this.serial.send(command, (data: string | Error) => {
            if (data instanceof Error) {
              this.platform.log.error(data.toString());
              callback(data);
            } else if (data.includes(command.trim())) {
              this.platform.log.debug('Set Characteristic Active ->', value);
      
              // the first argument of the callback should be null if there are no errors
              callback(null);
            } else if (data.includes('ZM')) {
              // Do nothing, zones don't matter
            } else {
              const errorMessage = `While attempting to set the power state, the serial command returned '${data}'`;
              this.platform.log.error(errorMessage);
              callback(new Error(errorMessage));
            }
          });
        } else {
          callback(null);
        }
      }
    });
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   * 
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   * 
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.tvService.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  getActive(callback: CharacteristicGetCallback): void {
    this.platform.log.debug('Getting power state from TV');

    const command = 'PW?\r';
    this.serial.send(command, (data: string | Error) => {
      if (data instanceof Error) {
        this.platform.log.error(data.toString());
        callback(data);
      } else if (data.includes('PWON') || data.includes('PWSTANDBY')) {
        const value = data.includes('PWON') ? true : false;

        this.platform.log.debug(`${command.trim()} received success: (${data}), returning ${value}`);

        // the first argument of the callback should be null if there are no errors
        // the second argument contains the current status of the device to return.
        callback(null, value);
      } else if (data.includes('ZM')) {
        // Do nothing, zones don't matter
      } else {
        const errorMessage = `While attempting to get the power state, the serial command returned '${data}'`;
        this.platform.log.error(errorMessage);
        callback(new Error(errorMessage), false);
      }
    });
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory.
   */
  setActiveIdentifier(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ): void {
    const thisInput = this.accessory.context.device.inputs[value as number];
    const command = `SI${thisInput.input}\r`;

    this.serial.send(command, (data: string | Error) => {
      if (data instanceof Error) {
        this.platform.log.error(data.toString());
        callback(data);
      } else if (data.includes(`SI${thisInput.input}`)) {
        this.platform.log.debug(
          'Set Characteristic Active Identifier -> ',
          value,
        );

        // the first argument of the callback should be null if there are no errors
        callback(null);

      } else if (data.includes('MS')) {
        // Do nothing, sound type don't matter
      } else {
        const errorMessage = `While attempting to set the input, the serial command returned '${data}'`;
        this.platform.log.error(errorMessage);
        callback(new Error(errorMessage));
      }
    });
  }

  /**
   * Handle "GET" requests from HomeKit
   * These are sent when the user changes the state of an accessory.
   */
  getActiveIdentifier(
    callback: CharacteristicSetCallback,
  ): void {

    this.platform.log.debug('Getting input state from TV');

    const command = 'SI?\r';
    this.serial.send(command, (data: string | Error) => {
      if (data instanceof Error) {
        this.platform.log.error(data.toString());
        callback(data, 0);
      } else if (data.includes('SI')) {
        const newInput = data.replace('SI', '');

        // Get the internal ID of the input with the ID that matches what the TV returned
        const value = this.accessory.context.device.inputs.findIndex((input: { input: string }) => input.input === newInput);

        if (value !== -1) {
          this.platform.log.debug('Get Characteristic ActiveIdentifier ->', value);

          // the first argument of the callback should be null if there are no errors
          // the second argument contains the current status of the device to return.
          callback(null, value);
        } else {
          const errorMessage = `Could not find matching input. Make sure you have a '${newInput}' input defined`;
          this.platform.log.error(errorMessage);
          callback(new Error(errorMessage), 0);
        }
      } else {
        const errorMessage = `While attempting to get input state, serial command returned '${data}'`;
        this.platform.log.error(errorMessage);
        callback(new Error(errorMessage), 0);
      }
    });
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory.
   */
  setMute(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ): void {
    const command = value ? 'MUON\r' : 'MUOFF\r';

    this.serial.send(command, (data: string | Error) => {
      if (data instanceof Error) {
        this.platform.log.error(data.toString());
        callback(data);
      } else if (data.includes(command.trim())) {
        this.platform.log.debug(`${command.trim()} received success: (${data})`);

        // the first argument of the callback should be null if there are no errors
        callback(null);

      } else {
        const errorMessage = `While attempting to ${value ? 'mute' : 'unmute'}, the serial command returned '${data}'`;
        this.platform.log.error(errorMessage);
        callback(new Error(errorMessage));
      }
    });
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory.
   */
  setVolume(
    value: CharacteristicValue,
    callback: CharacteristicSetCallback,
  ): void {
    const command = value === this.platform.Characteristic.VolumeSelector.DECREMENT ? 'MVDOWN\r' : 'MVUP\r';

    this.serial.send(command, (data: string | Error) => {
      if (data instanceof Error) {
        this.platform.log.error(data.toString());
        callback(data);
      } else if (data.includes('MV')) {
        this.platform.log.debug(`${command.trim()} received success: (${data})`);
        // the first argument of the callback should be null if there are no errors
        callback(null);
      } else {
        const errorMessage = `While attempting to set volume, the serial command returned '${data}'`;
        this.platform.log.error(errorMessage);
        callback(new Error(errorMessage));
      }
    });

  }
}

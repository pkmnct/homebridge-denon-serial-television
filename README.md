# Homebridge Denon Serial

This Homebridge plugin enables control of (older) Denon AVR Receivers using a serial connection.
It was tested with an AVR-3803

## Compatibility

This should work with any Denon AVR that uses the following for serial control:

- Power
    - Getting Power State: `PW?`
    - Turning on: `POON`
    - Turning off: `POSTANDBY`
- Input Control
    - Getting Input State: `SI?`
    - Switching Input: `SI<input>`
        - See configuration for supported inputs
- Volume
    - Getting Mute State: `MU?`
    - Mute On: `MUON`
    - Mute Off: `MUOFF`
    - Volume Up: `MVUP`
    - Volume Down: `MVDOWN`

It is recommended that you use [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x) for GUI configuration. You can also view the [configuration schema](config.schema.json).
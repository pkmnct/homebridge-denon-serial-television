import SerialPort from 'serialport';

export class SerialProtocol {
    private readonly port: SerialPort;
    private readonly parser: SerialPort.parsers.Readline;

    private readonly queue: { command: string; callback: Function}[];
    private busy: boolean;
    private current: { command: string; callback: Function} | null;
    private timeout: ReturnType<typeof setTimeout> | null;

    public send: (command: string, callback: Function) => void;
    private processQueue: () => void;

    constructor(
        private readonly path: string,
        private readonly logger: { info: Function; error: Function; debug: Function },
    ) {

      // Initialize Serial Port
      this.port = new SerialPort(path, {
        baudRate: 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        rtscts: false,
      }, (error: Error | null | undefined) => {
        if (error) {
          logger.error(error.message);
        } else {
          logger.debug(`[Serial] Initialized serial port at ${this.path}`);
        }
      });

      // Initialize Parser
      this.parser = this.port.pipe(new SerialPort.parsers.Readline({
        delimiter: '\r',
      }));

      // Initialize other variables
      this.busy = false;
      this.queue = [];
      this.current = null;     
      this.timeout = null;
      
      this.parser.on('data', (data: string): void => {
        // If we aren't expecting data, ignore it
        if (!this.current) {
          // TODO, listen for these and send as events to controller. 
          // This will allow us to update our state right as inputs change instead of waiting for a refresh
          return;
        }

        logger.debug(`[Serial] Got Data ${data}, sending to: ${JSON.stringify(this.current)}`);
        this.current.callback(data);
        this.current = null;
        this.processQueue();
      });

      this.send = (command: string, callback: Function): void => {
        logger.debug(`[Serial] Pushing command ${command.trim()} on to queue.`);
        // Push the command on the queue
        this.queue.push({command, callback});

        // If we are processing another command, return
        if (this.busy) {
          logger.debug('[Serial] Currently busy');
          return;
        }

        // We are now processing a command
        this.busy = true;
        this.processQueue();
      };

      this.processQueue = (): void => {
        // Get the command from the queue
        const next = this.queue.shift();

        if (!next) {
          this.busy = false;
        } else {
          this.current = next;
          logger.info(`Sending command to ${this.path}: ${next.command.trim()}`);
          this.port.write(next.command);

          // If after 500ms a command still hasn't processed, skip it and go to the next.
          this.timeout && clearTimeout(this.timeout);
          this.timeout = setTimeout(() => {
            if (this.busy && this.current) {
              this.current.callback(new Error(`${this.current.command.trim()} timed out after 30ms. Skipping`));
              this.busy = false;
              this.processQueue();
            }
          }, 500);
        }
      };
    }    
}
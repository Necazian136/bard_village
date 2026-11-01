import {Midi} from "@tonejs/midi";

export interface MidiParser {
    parse(midi: Midi, trackNumber: Number): void;
}

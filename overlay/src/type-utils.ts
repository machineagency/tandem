export type EBB = 'ebb';
export type GCode = 'gcode';
export type SBP = 'sbp';
export type ISA = EBB | GCode | SBP;
export type Instruction = string;
export type Operation = 'move' | 'arc';

export type StepStatus = 'standby' |'step' | 'calibration';
export type MarkType = 'arrow' | 'crosshair' | 'box' | 'circle' | 'text' | 'svg'
                | 'calibrationBox' | 'toolpath' | 'screwPosition' | 'sectionAnnotation' | 'boxOutline' | 'flipStock';
export type TSSName = 'basic' | 'bore' | 'outline';
export type SectionAnnotationName = 'screwDepth' | 'passDepths';
export type ToolType = 'face' | 'ball';


export interface Toolpath extends Mark {
    tssName: TSSName;
    isa: ISA;
    instructions: Instruction[];
    toolType: ToolType;
    type: 'toolpath';
    dowelDiam: number;
}

export interface IR {
    op: Operation;
    args: {
        x: number | null;
        y: number | null;
        z: number | null;
        f: number | null;
        dx: number | null;
        dy: number | null;
    }, 
    state: {
        units: string | null;
        toolOnBed: boolean;
        clockwise: number | null;
    }
};

export interface Step {
    name: string;
    type: StepStatus;
    marks: Mark[];
};
  
export interface Mark {
    type: MarkType;
    location: { x: number, y: number };
};

export interface Arrow extends Mark {
    to: { x: number, y: number };
    type: 'arrow';
};
  
export interface Crosshair extends Mark {
    type: 'crosshair';
};
  
export interface Box extends Mark {
    width: number;
    height: number;
    type: 'box';
};

export interface BoxOutline extends Mark {
    width: number;
    height: number;
    type: 'boxOutline'
};

export interface FlipStock extends Mark {
    width: number;
    height: number;
    type: 'flipStock'
};
  
export interface Circle extends Mark {
    radius: number;
    type: 'circle';
};
  
export interface Text extends Mark {
    text: string;
    type: 'text';
};
  
export interface SVG extends Mark {
    text: string;
    type: 'svg';
};
  
export interface CalibrationBox extends Mark {
    //type: "calibrationBox";
};

export interface ScrewPosition extends Mark {
    width: number;
    height: number;
    offset: number;
    type: 'screwPosition';
}
export interface SectionAnnotation extends Mark {
    type: 'sectionAnnotation';
    annotationName: SectionAnnotationName;
    instructions: Instruction[];
    args: Record<string, any>;
};

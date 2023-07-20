import adsk.core
import adsk.fusion
import adsk.cam
import traceback
import os
from .PropellerCAM import *
from .CreateUserParameter import *



def run(context):
    ui = None
    try:
        
        pcam = PropellerCAM()
        pcam.create_alignmentJig()
        pcam.create_foam_surface()
        pcam.create_foam_bore()
        pcam.create_top_cut()
        pcam.create_bottom_cut()

    except:
        if ui:
            ui.messageBox('Failed:\n{}'.format(traceback.format_exc()))

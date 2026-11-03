import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from exportar_sap2000 import distributed_loads, joint_disp, names

class MockFrames:
    def GetLoadDistributed(self,*args):
        return (1,['B1'],['G'],[1],['Global'],[6],[0.0],[1.0],[0.0],[5.0],[-4.0],[-8.0],0)
    def GetNameList(self,*args):
        return (1,['B1'],0)
class MockResult:
    def JointDispl(self,*args):
        return (1,['P1'],['P1'],['LC1'],['Step'],[0.0],[.001],[0.0],[-.005],[0.0],[0.0],[0.0],0)
class MockModel:
    FrameObj=MockFrames()
    Results=MockResult()

def test_export_sap_api_layout():
    m=MockModel()
    assert names(m.FrameObj,'names')==['B1']
    d,has=joint_disp(m,'P1')
    assert has and d['ux']==.001 and d['uz']==-.005
    l=distributed_loads(m,'B1')
    assert l[0]=={'frame':'B1','pattern':'G','type':'force_per_length','csys':'Global','dir':6,'start':0.,'end':1.,'w1':-4.,'w2':-8.}

if __name__=='__main__':
    test_export_sap_api_layout()
    print('OK: exportación SAP2000 contra doble de prueba del OAPI (NO contra SAP2000 real)')
